/**
 * Catchball (top atışı) onay yaşam döngüsü — saf geçiş matrisi.
 * Yan etkili `applyTransition` (tx içinde) Faz 3'te eklenir; burada yalnız kurallar.
 *
 * INV-5: bir varlık ancak `catchballStatus === "APPROVED"` ise canlı incelemeye (ACTIVE) geçebilir.
 */

import { type Prisma } from "@prisma/client";
import {
  CATCHBALL_STATUSES,
  type CatchballEntityType,
  type CatchballItemType,
  type CatchballStatus,
} from "@/lib/domainTypes";
import { recordAudit } from "@/lib/engine/audit";
import { notify } from "@/lib/engine/notifications";
import { logEvent } from "@/lib/log";

/** İzinli geçişler. APPROVED ve (terminal yakını) durumların çıkışları kasıtlı sınırlıdır. */
export const TRANSITIONS: Record<CatchballStatus, readonly CatchballStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["REVISED", "AGREED", "REJECTED"],
  REVISED: ["IN_REVIEW", "AGREED"],
  AGREED: ["APPROVED", "IN_REVIEW"],
  APPROVED: [], // terminal — onaylanan yeniden açılamaz (gerekirse ayrı bir aksiyon)
  REJECTED: ["DRAFT"], // reddedilen yalnızca yeniden taslağa dönebilir
};

/** Verilen string geçerli bir CatchballStatus mu? */
export function isCatchballStatus(s: string): s is CatchballStatus {
  return (CATCHBALL_STATUSES as readonly string[]).includes(s);
}

/**
 * `from` durumundan `to` durumuna geçiş izinli mi?
 * Geçersiz/bilinmeyen `from` için güvenle `false` döner (sessizce true dönmez).
 */
export function canTransition(from: string, to: string): boolean {
  if (!isCatchballStatus(from)) return false;
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

/** `from` durumundan gidilebilecek durumlar (bilinmeyen `from` → boş dizi). */
export function nextStatuses(from: string): readonly CatchballStatus[] {
  if (!isCatchballStatus(from)) return [];
  return TRANSITIONS[from];
}

/** Varlık canlı incelemeye (ACTIVE) alınabilir mi? Yalnız APPROVED. (INV-5) */
export function canActivate(catchballStatus: string): boolean {
  return catchballStatus === "APPROVED";
}

// --- Yan etkili geçiş uygulayıcısı (tx içinde) ---

/**
 * Catchball varlık tipini ilgili Prisma modeline eşler. `catchballStatus` sütununu okur/yazar.
 * Bilinmeyen tip → fırlatır (sessiz dönüş yok).
 */
async function readCatchballStatus(
  tx: Prisma.TransactionClient,
  entityType: CatchballEntityType,
  entityId: string,
): Promise<string | null> {
  switch (entityType) {
    case "HOSHIN":
      return (
        (await tx.hoshin.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
    case "MAJOR_TASK":
      return (
        (
          await tx.majorTask.findUnique({
            where: { id: entityId },
            select: { catchballStatus: true },
          })
        )?.catchballStatus ?? null
      );
    case "ACTION_PLAN":
      return (
        (
          await tx.actionPlan.findUnique({
            where: { id: entityId },
            select: { catchballStatus: true },
          })
        )?.catchballStatus ?? null
      );
    case "KPI":
      return (
        (await tx.kPI.findUnique({ where: { id: entityId }, select: { catchballStatus: true } }))
          ?.catchballStatus ?? null
      );
    default:
      throw new Error(`Bilinmeyen catchball varlık tipi: ${entityType as string}`);
  }
}

async function writeCatchballStatus(
  tx: Prisma.TransactionClient,
  entityType: CatchballEntityType,
  entityId: string,
  to: CatchballStatus,
): Promise<void> {
  switch (entityType) {
    case "HOSHIN":
      await tx.hoshin.update({ where: { id: entityId }, data: { catchballStatus: to } });
      return;
    case "MAJOR_TASK":
      await tx.majorTask.update({ where: { id: entityId }, data: { catchballStatus: to } });
      return;
    case "ACTION_PLAN":
      await tx.actionPlan.update({ where: { id: entityId }, data: { catchballStatus: to } });
      return;
    case "KPI":
      await tx.kPI.update({ where: { id: entityId }, data: { catchballStatus: to } });
      return;
    default:
      throw new Error(`Bilinmeyen catchball varlık tipi: ${entityType as string}`);
  }
}

export interface ApplyTransitionInput {
  entityType: CatchballEntityType;
  entityId: string;
  /** Hedef durum. `canTransition(mevcut, to)` geçersizse fırlatır (INV-7). */
  to: CatchballStatus;
  itemType: CatchballItemType;
  message: string;
  actorUserId?: string | null;
  /** Bilgilendirilecek karşı taraf (varsa). */
  counterpartyUserId?: string | null;
  toRole?: string | null;
  toDeptId?: string | null;
  context?: string;
}

export interface ApplyTransitionResult {
  from: CatchballStatus;
  to: CatchballStatus;
  itemId: string;
}

/**
 * Bir catchball geçişini **çağıranın transaction'ı içinde** atomik olarak uygular:
 * varlığın `catchballStatus`'ını günceller, `CatchballItem` ekler, `TRANSITION` denetimi
 * yazar ve (varsa) karşı tarafı bilgilendirir. Geçiş izinsizse veya varlık yoksa fırlatır;
 * tx geri alındığı için hiçbir kısmi yazma kalmaz (INV-1/INV-7).
 */
export async function applyTransition(
  tx: Prisma.TransactionClient,
  input: ApplyTransitionInput,
): Promise<ApplyTransitionResult> {
  const current = await readCatchballStatus(tx, input.entityType, input.entityId);
  if (current === null) {
    throw new Error(`Catchball varlığı bulunamadı: ${input.entityType}:${input.entityId}`);
  }
  if (!isCatchballStatus(current)) {
    throw new Error(`Geçersiz mevcut catchball durumu: ${current}`);
  }
  if (!canTransition(current, input.to)) {
    throw new Error(`İzinsiz catchball geçişi: ${current} → ${input.to}`);
  }
  const from = current;

  await writeCatchballStatus(tx, input.entityType, input.entityId, input.to);

  const item = await tx.catchballItem.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.itemType,
      message: input.message,
      fromUserId: input.actorUserId ?? null,
      toUserId: input.counterpartyUserId ?? null,
      toRole: input.toRole ?? null,
      toDeptId: input.toDeptId ?? null,
      resultingStatus: input.to,
    },
  });

  await recordAudit(tx, {
    actorUserId: input.actorUserId ?? null,
    action: "TRANSITION",
    entityType: input.entityType,
    entityId: input.entityId,
    changes: [{ field: "catchballStatus", old: from, new: input.to }],
    summary: `Catchball: ${from} → ${input.to}`,
    context: input.context ?? "catchball.applyTransition",
  });

  if (input.counterpartyUserId) {
    const approved = input.to === "APPROVED";
    // Catchball olayları doğası gereği tekrarlı değil (her geçiş durumu ilerletir),
    // beşli-dedupe çok kaba kalır → idempotent:false ile her geçiş bildirilir.
    await notify(tx, {
      userId: input.counterpartyUserId,
      type: approved ? "CATCHBALL_APPROVED" : "CATCHBALL_REQUEST",
      title: approved ? "Catchball onaylandı" : "Catchball incelemesi gerekiyor",
      body: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotent: false,
    });
  }

  logEvent("info", "catchball.transition", {
    entityType: input.entityType,
    entityId: input.entityId,
    from,
    to: input.to,
    itemId: item.id,
  });

  return { from, to: input.to, itemId: item.id };
}
