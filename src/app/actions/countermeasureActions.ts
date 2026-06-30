"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateCountermeasure(id: string, data: { rootCause?: string; actionSummary?: string; expectedImpact?: string; dueDate?: string | null; status?: string; closureNote?: string }) {
  const { dueDate, ...rest } = data;
  const updatedCm = await prisma.countermeasure.update({
    where: { id },
    data: {
      ...rest,
      // dueDate: "" → temizle (null), "YYYY-MM-DD" → Date; undefined → dokunma
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    }
  });

  revalidatePath("/countermeasure");
  revalidatePath("/my-tasks");
  revalidatePath("/meetings");

  return updatedCm;
}

/**
 * FR-23: Karşı önlemi bağımsız bir göreve dönüştürür. Mevcut Task.countermeasureId FK'sini
 * kullanır; görev karşı önlemin sahibine (yoksa oturum sahibine) atanır. source=MANUAL.
 */
export async function convertCountermeasureToTask(cmId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }

  const cm = await prisma.countermeasure.findUnique({ where: { id: cmId } });
  if (!cm) {
    return { success: false, error: "Karşı önlem bulunamadı." };
  }

  const assigneeId = cm.ownerUserId ?? session.userId;
  const title = (cm.actionSummary?.trim() || cm.problemStatement?.trim() || "Karşı önlem görevi").slice(0, 120);

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          type: "DECISION_FOLLOWUP", // genel takip türü; source=MANUAL ile ayrışır
          title,
          description: cm.rootCause?.trim() || null,
          source: "MANUAL",
          status: "OPEN",
          priority: "MEDIUM",
          dueDate: cm.dueDate ?? null,
          assigneeId,
          countermeasureId: cm.id,
          kpiId: cm.kpiId ?? null,
        },
      });
      await recordAudit(tx, {
        actorUserId: session.userId,
        action: "CREATE",
        entityType: "Task",
        entityId: task.id,
        summary: `Karşı önlemden görev oluşturuldu: ${title.slice(0, 80)}`,
        context: "convertCountermeasureToTask",
      });
    });
  } catch (e) {
    logEvent("error", "convertCountermeasureToTask.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Görev oluşturulamadı. Lütfen tekrar deneyin." };
  }

  revalidatePath("/countermeasure");
  revalidatePath("/my-tasks");
  return { success: true };
}
