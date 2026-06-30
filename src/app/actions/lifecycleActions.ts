"use server";

/**
 * FR-06: Hoshin/MajorTask/ActionPlan yaşam döngüsü durum geçişleri.
 * Her geçiş: oturum + yetki denetimi → `$transaction` içinde güncelleme + `diff()`-tabanlı
 * `recordAudit` (action `"TRANSITION"`) → `lifecycle.transition` log olayı.
 */

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import {
  HOSHIN_STATUSES,
  ACTION_PLAN_STATUSES,
  isHoshinStatus,
} from "@/lib/domainTypes";
import { recordAudit, diff } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";
import type { UserScope } from "@/lib/dataScope";

export type ActionResult = { success: true } | { success: false; error: string };

async function getActorScope(): Promise<UserScope | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

// MajorTask şemasında DRAFT/ACTIVE/COMPLETED kullanılır — HOSHIN_STATUSES'un alt kümesi.
function isMajorTaskStatus(s: string): boolean {
  return (HOSHIN_STATUSES as readonly string[]).includes(s);
}

function isActionPlanStatusVal(s: string): boolean {
  return (ACTION_PLAN_STATUSES as readonly string[]).includes(s);
}

/**
 * Hoshin durum geçişi.
 * Yetki: kurum geneli roller + sponsor (hoshinSponsorUserId === user.id).
 * Geçerli değerler: HOSHIN_STATUSES (DRAFT / ACTIVE / COMPLETED / CANCELLED).
 */
export async function setHoshinStatus(id: string, status: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isHoshinStatus(status)) {
    return { success: false, error: `Geçersiz hoshin durumu: ${status}` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.hoshin.findUniqueOrThrow({
        where: { id },
        select: { status: true, sponsorUserId: true },
      });

      // Yetki: kurum geneli roller veya sponsor.
      if (!isOrgWideRole(scope.role) && before.sponsorUserId !== scope.id) {
        throw new Error("Bu işlem için yetkiniz yok.");
      }

      await tx.hoshin.update({ where: { id }, data: { status } });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "TRANSITION",
        entityType: "Hoshin",
        entityId: id,
        changes: diff(
          before as Record<string, unknown>,
          { status } as Record<string, unknown>,
          ["status"],
        ),
        summary: `Hoshin durumu: ${before.status} → ${status}`,
        context: "setHoshinStatus",
      });
      logEvent("info", "lifecycle.transition", {
        entityType: "Hoshin",
        entityId: id,
        from: before.status,
        to: status,
      });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Bu işlem için yetkiniz yok.") {
      return { success: false, error: msg };
    }
    logEvent("error", "setHoshinStatus.failed", { id, status, message: msg });
    return { success: false, error: "Hoshin durumu güncellenemedi. Lütfen tekrar deneyin." };
  }
}

/**
 * MajorTask durum geçişi.
 * Yetki: kurum geneli roller (MajorTask'ta doğrudan sahip alanı yok; muhafazakâr yorum).
 * Geçerli değerler: HOSHIN_STATUSES alt kümesi (DRAFT / ACTIVE / COMPLETED / CANCELLED).
 */
export async function setMajorTaskStatus(id: string, status: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller ana görev durumunu değiştirebilir." };
  }
  if (!isMajorTaskStatus(status)) {
    return { success: false, error: `Geçersiz ana görev durumu: ${status}` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.majorTask.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      await tx.majorTask.update({ where: { id }, data: { status } });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "TRANSITION",
        entityType: "MajorTask",
        entityId: id,
        changes: diff(
          before as Record<string, unknown>,
          { status } as Record<string, unknown>,
          ["status"],
        ),
        summary: `Ana görev durumu: ${before.status} → ${status}`,
        context: "setMajorTaskStatus",
      });
      logEvent("info", "lifecycle.transition", {
        entityType: "MajorTask",
        entityId: id,
        from: before.status,
        to: status,
      });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent("error", "setMajorTaskStatus.failed", { id, status, message: msg });
    return { success: false, error: "Ana görev durumu güncellenemedi. Lütfen tekrar deneyin." };
  }
}

/**
 * ActionPlan durum geçişi.
 * Yetki: kurum geneli roller veya aksiyon planı sahibi (`ownerUserId === user.id`).
 * Geçerli değerler: ACTION_PLAN_STATUSES (NOT_STARTED / IN_PROGRESS / COMPLETED / DELAYED).
 */
export async function setActionPlanStatus(id: string, status: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isActionPlanStatusVal(status)) {
    return { success: false, error: `Geçersiz aksiyon planı durumu: ${status}` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.actionPlan.findUniqueOrThrow({
        where: { id },
        select: { status: true, ownerUserId: true },
      });

      // Yetki: kurum geneli roller veya aksiyon planı sahibi.
      if (!isOrgWideRole(scope.role) && before.ownerUserId !== scope.id) {
        throw new Error("Bu işlem için yetkiniz yok.");
      }

      await tx.actionPlan.update({ where: { id }, data: { status } });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "TRANSITION",
        entityType: "ActionPlan",
        entityId: id,
        changes: diff(
          before as Record<string, unknown>,
          { status } as Record<string, unknown>,
          ["status"],
        ),
        summary: `Aksiyon planı durumu: ${before.status} → ${status}`,
        context: "setActionPlanStatus",
      });
      logEvent("info", "lifecycle.transition", {
        entityType: "ActionPlan",
        entityId: id,
        from: before.status,
        to: status,
      });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Bu işlem için yetkiniz yok.") {
      return { success: false, error: msg };
    }
    logEvent("error", "setActionPlanStatus.failed", { id, status, message: msg });
    return { success: false, error: "Aksiyon planı durumu güncellenemedi. Lütfen tekrar deneyin." };
  }
}
