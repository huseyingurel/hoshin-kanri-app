"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * FR-33: bir toplantı kararını bağlı bir Aksiyon Planına dönüştürür. Plan, kararın KPI'sının
 * mevcut aksiyon planının Ana Hedefi (MajorTask) altına eklenir. Karar bir KPI'ya/zincire
 * bağlı değilse **uydurma yapmaz**, açık hata döner (kuralı raporla, icat etme).
 *
 * Tek transaction: ActionPlan oluştur + Decision.actionPlanId bağla + iki denetim kaydı.
 */
export async function createActionPlanFromDecision(
  decisionId: string,
): Promise<ActionResult<{ actionPlanId: string }>> {
  const session = await getSession();
  if (!session?.userId) return { success: false, error: "Oturum bulunamadı." };

  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { kpi: { include: { actionPlan: true } } },
  });
  if (!decision) return { success: false, error: "Karar bulunamadı." };
  if (decision.actionPlanId) {
    return { success: false, error: "Bu karar zaten bir aksiyon planına bağlı." };
  }

  const majorTaskId = decision.kpi?.actionPlan?.majorTaskId;
  if (!majorTaskId) {
    return {
      success: false,
      error: "Karar bir KPI/aksiyon planı zincirine bağlı değil; hedef Ana Hedef belirlenemiyor.",
    };
  }

  const title = decision.decisionText.trim().slice(0, 120) || "Karardan aksiyon planı";

  try {
    const actionPlanId = await prisma.$transaction(async (tx) => {
      const ap = await tx.actionPlan.create({
        data: {
          title,
          description: `Toplantı kararından oluşturuldu (karar: ${decision.id})`,
          majorTaskId,
          status: "NOT_STARTED",
          ownerUserId: decision.assigneeId ?? null,
        },
      });
      await tx.decision.update({ where: { id: decision.id }, data: { actionPlanId: ap.id } });

      await recordAudit(tx, {
        actorUserId: session.userId,
        action: "CREATE",
        entityType: "ActionPlan",
        entityId: ap.id,
        summary: `Karardan aksiyon planı: ${title.slice(0, 80)}`,
        context: "createActionPlanFromDecision",
      });
      await recordAudit(tx, {
        actorUserId: session.userId,
        action: "UPDATE",
        entityType: "Decision",
        entityId: decision.id,
        changes: [{ field: "actionPlanId", old: null, new: ap.id }],
        summary: "Karar aksiyon planına bağlandı",
        context: "createActionPlanFromDecision",
      });
      return ap.id;
    });

    logEvent("info", "actionPlan.created", { decisionId: decision.id, actionPlanId });
    revalidatePath("/meetings");
    revalidatePath("/strategy");
    return { success: true, data: { actionPlanId } };
  } catch (e) {
    logEvent("error", "actionPlan.failed", {
      decisionId: decision.id,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Aksiyon planı oluşturulamadı." };
  }
}
