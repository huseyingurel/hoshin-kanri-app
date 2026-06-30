"use server";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole, usesDepartmentalDataScope } from "@/lib/access";
import { hoshinScopeFilter, personalKpiScopeFilter, type UserScope } from "@/lib/dataScope";
import { applyTransition } from "@/lib/engine/catchball";
import { recordAudit } from "@/lib/engine/audit";
import {
  CATCHBALL_ENTITY_TYPES,
  CATCHBALL_ITEM_TYPES,
  CATCHBALL_STATUSES,
  type CatchballEntityType,
  type CatchballItemType,
  type CatchballStatus,
} from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };

function isEntityType(s: string): s is CatchballEntityType {
  return (CATCHBALL_ENTITY_TYPES as readonly string[]).includes(s);
}
function isStatus(s: string): s is CatchballStatus {
  return (CATCHBALL_STATUSES as readonly string[]).includes(s);
}
function isItemType(s: string): s is CatchballItemType {
  return (CATCHBALL_ITEM_TYPES as readonly string[]).includes(s);
}

async function currentScope(): Promise<UserScope | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

/**
 * Kullanıcı bu catchball varlığına erişebilir mi? Kurum geneli roller her şeyi görür;
 * departman kapsamlı roller yalnız kendi/departman kapsamındaki varlıklara erişir (INV-4:
 * kapsam yalnız kullanıcının kendi alanına genişler, asla daraltılmaz). Catchball iş birliğine
 * dayalı olsa da, bir kullanıcının göremediği bir varlığın yaşam döngüsünü değiştirmesini
 * engeller (doğrudan aksiyon çağrısıyla IDOR'a karşı).
 */
async function canAccess(
  scope: UserScope,
  entityType: CatchballEntityType,
  entityId: string,
): Promise<boolean> {
  if (isOrgWideRole(scope.role)) return true;
  switch (entityType) {
    case "HOSHIN": {
      const w = hoshinScopeFilter(scope);
      const f = await prisma.hoshin.findFirst({
        where: { id: entityId, ...(w ?? {}) },
        select: { id: true },
      });
      return !!f;
    }
    case "MAJOR_TASK": {
      const w = hoshinScopeFilter(scope);
      const f = await prisma.majorTask.findFirst({
        where: { id: entityId, ...(w ? { hoshin: w } : {}) },
        select: { id: true },
      });
      return !!f;
    }
    case "ACTION_PLAN": {
      const or: Prisma.ActionPlanWhereInput[] = [
        { ownerUserId: scope.id },
        { kpis: { some: { ownerUserId: scope.id } } },
      ];
      if (usesDepartmentalDataScope(scope.role, scope.departmentId) && scope.departmentId) {
        or.push({ responsibleDeptId: scope.departmentId });
        or.push({ kpis: { some: { responsibleDeptId: scope.departmentId } } });
      }
      const f = await prisma.actionPlan.findFirst({
        where: { id: entityId, OR: or },
        select: { id: true },
      });
      return !!f;
    }
    case "KPI": {
      const f = await prisma.kPI.findFirst({
        where: { id: entityId, ...personalKpiScopeFilter(scope) },
        select: { id: true },
      });
      return !!f;
    }
  }
}

/** Varlığın güncel catchballStatus'unu okur (tip → model eşlemesi). Bulunamazsa null. */
async function readStatus(
  entityType: CatchballEntityType,
  entityId: string,
): Promise<string | null> {
  switch (entityType) {
    case "HOSHIN":
      return (
        (await prisma.hoshin.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
    case "MAJOR_TASK":
      return (
        (await prisma.majorTask.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
    case "ACTION_PLAN":
      return (
        (await prisma.actionPlan.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
    case "KPI":
      return (
        (await prisma.kPI.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
  }
}

export interface CatchballThread {
  status: string | null;
  items: Array<{
    id: string;
    type: string;
    message: string;
    resultingStatus: string | null;
    createdAt: Date;
    fromUser: { id: string; name: string } | null;
    toUser: { id: string; name: string } | null;
  }>;
}

/** Bir varlığın catchball geçmişi + güncel durumu. */
export async function getThread(entityType: string, entityId: string): Promise<CatchballThread> {
  const scope = await currentScope();
  if (!scope || !isEntityType(entityType)) {
    return { status: null, items: [] };
  }
  if (!(await canAccess(scope, entityType, entityId))) {
    return { status: null, items: [] };
  }
  const [status, items] = await Promise.all([
    readStatus(entityType, entityId),
    prisma.catchballItem.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { status, items };
}

/**
 * Durum değiştirmeyen bir yorum/not ekler.
 * `itemType` belirtilmezse `COMMENT`'e varsayılan olarak atanır.
 * Durum geçişi gerektiren tipler (APPROVAL, REJECTION) burada reddedilir;
 * bunlar `transitionCatchball` üzerinden yönetilir.
 * FR-08: REVISION_REQUEST ve COUNTER_PROPOSAL de bu yol üzerinden iletilir.
 * FR-09: `toRole` / `toDeptId` ile rol veya departmana yönlendirme.
 */
export async function postCatchball(input: {
  entityType: string;
  entityId: string;
  message: string;
  toUserId?: string;
  /** COMMENT | REVISION_REQUEST | COUNTER_PROPOSAL (varsayılan: COMMENT). */
  itemType?: string;
  toRole?: string;
  toDeptId?: string;
}): Promise<ActionResult> {
  const scope = await currentScope();
  if (!scope) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  if (!isEntityType(input.entityType)) {
    return { success: false, error: "Geçersiz varlık tipi." };
  }
  const message = input.message?.trim();
  if (!message) {
    return { success: false, error: "Mesaj boş olamaz." };
  }
  if (!(await canAccess(scope, input.entityType, input.entityId))) {
    return { success: false, error: "Bu öğe için yetkiniz yok." };
  }
  const status = await readStatus(input.entityType, input.entityId);
  if (status === null) {
    return { success: false, error: "Varlık bulunamadı." };
  }

  // Durum geçişi gerektiren tipler bu yoldan geçemez.
  const TRANSITION_ONLY_TYPES = ["APPROVAL", "REJECTION"];
  const resolvedItemType =
    input.itemType && isItemType(input.itemType) ? input.itemType : "COMMENT";
  if (TRANSITION_ONLY_TYPES.includes(resolvedItemType)) {
    return {
      success: false,
      error: "APPROVAL ve REJECTION yalnızca transitionCatchball üzerinden gönderilebilir.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.catchballItem.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          type: resolvedItemType,
          message,
          fromUserId: scope.id,
          toUserId: input.toUserId ?? null,
          toRole: input.toRole ?? null,
          toDeptId: input.toDeptId ?? null,
        },
      });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "CREATE",
        entityType: input.entityType,
        entityId: input.entityId,
        summary: "Catchball yorumu eklendi",
        context: "postCatchball",
      });
      logEvent("info", "catchball.comment", {
        entityType: input.entityType,
        entityId: input.entityId,
        itemId: item.id,
        itemType: resolvedItemType,
      });
    });
  } catch (e) {
    logEvent("error", "postCatchball.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Yorum eklenemedi. Lütfen tekrar deneyin." };
  }

  revalidatePath("/strategy");
  return { success: true };
}

/**
 * Catchball durum geçişi uygular (engine/applyTransition'a devreder). İzinsiz geçiş → hata (INV-7).
 * FR-09: `toRole` / `toDeptId` ile rol veya departmana yönlendirme; engine bu alanları
 * `CatchballItem` üzerine yazar (applyTransition zaten destekler).
 */
export async function transitionCatchball(input: {
  entityType: string;
  entityId: string;
  to: string;
  message: string;
  itemType?: string;
  counterpartyUserId?: string;
  toRole?: string;
  toDeptId?: string;
}): Promise<ActionResult> {
  const scope = await currentScope();
  if (!scope) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  if (!isEntityType(input.entityType)) {
    return { success: false, error: "Geçersiz varlık tipi." };
  }
  if (!isStatus(input.to)) {
    return { success: false, error: "Geçersiz hedef durum." };
  }
  const message = input.message?.trim();
  if (!message) {
    return { success: false, error: "Geçiş için bir açıklama gereklidir." };
  }
  if (!(await canAccess(scope, input.entityType, input.entityId))) {
    return { success: false, error: "Bu öğe için yetkiniz yok." };
  }
  const itemType: CatchballItemType =
    input.itemType && isItemType(input.itemType)
      ? input.itemType
      : input.to === "APPROVED"
        ? "APPROVAL"
        : input.to === "REJECTED"
          ? "REJECTION"
          : "REVISION_REQUEST";

  try {
    await prisma.$transaction(async (tx) => {
      await applyTransition(tx, {
        entityType: input.entityType as CatchballEntityType,
        entityId: input.entityId,
        to: input.to as CatchballStatus,
        itemType,
        message,
        actorUserId: scope.id,
        counterpartyUserId: input.counterpartyUserId ?? null,
        toRole: input.toRole ?? null,
        toDeptId: input.toDeptId ?? null,
        context: "transitionCatchball",
      });
    });
  } catch (e) {
    // İzinsiz geçiş ya da varlık yok: applyTransition fırlatır, tx geri alınır (INV-7).
    logEvent("warn", "transitionCatchball.rejected", {
      entityType: input.entityType,
      entityId: input.entityId,
      to: input.to,
      message: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "Geçiş uygulanamadı.",
    };
  }

  revalidatePath("/strategy");
  revalidatePath("/notifications");
  return { success: true };
}
