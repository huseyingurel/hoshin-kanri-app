"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
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
  const session = await getSession();
  if (!session?.userId || !isEntityType(entityType)) {
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

/** Durum değiştirmeyen bir yorum/not ekler (COMMENT). Denetlenir. */
export async function postCatchball(input: {
  entityType: string;
  entityId: string;
  message: string;
  toUserId?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  if (!isEntityType(input.entityType)) {
    return { success: false, error: "Geçersiz varlık tipi." };
  }
  const message = input.message?.trim();
  if (!message) {
    return { success: false, error: "Mesaj boş olamaz." };
  }
  const status = await readStatus(input.entityType, input.entityId);
  if (status === null) {
    return { success: false, error: "Varlık bulunamadı." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.catchballItem.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          type: "COMMENT",
          message,
          fromUserId: session.userId,
          toUserId: input.toUserId ?? null,
        },
      });
      await recordAudit(tx, {
        actorUserId: session.userId,
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

/** Catchball durum geçişi uygular (engine/applyTransition'a devreder). İzinsiz geçiş → hata (INV-7). */
export async function transitionCatchball(input: {
  entityType: string;
  entityId: string;
  to: string;
  message: string;
  itemType?: string;
  counterpartyUserId?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
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
        actorUserId: session.userId,
        counterpartyUserId: input.counterpartyUserId ?? null,
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
