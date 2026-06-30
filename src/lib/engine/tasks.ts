/**
 * Görev yardımcıları: saf `buildDedupeKey` + tx içinde çalışan `upsertSystemTask`.
 */

import { type Prisma, type Task } from "@prisma/client";
import type { TaskPriority, TaskType } from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

/**
 * SYSTEM görevleri için idempotans anahtarı: "{type}:{entityType}:{entityId}:{periodKey}".
 * Aynı (tür, varlık, dönem) için tek bir sistem görevi olmasını sağlar (INV-2).
 * periodKey verilmezse boş bırakılır (dönemden bağımsız görevler).
 *
 * Not: parçalar ":" ile birleştirilir; cuid kimlikleri ve dönem anahtarları ":" içermez,
 * dolayısıyla çakışma pratikte olası değildir.
 */
export function buildDedupeKey(
  type: TaskType,
  entityType: string,
  entityId: string,
  periodKey?: string | null,
): string {
  return [type, entityType, entityId, periodKey ?? ""].join(":");
}

/** Görevin bağlı olduğu kaynak varlık(lar)a yumuşak FK'ler (yalnız ilgili olan doldurulur). */
export interface SystemTaskLinks {
  kpiId?: string | null;
  kpiPeriodRecordId?: string | null;
  countermeasureId?: string | null;
  actionPlanId?: string | null;
  decisionId?: string | null;
}

export interface UpsertSystemTaskInput {
  type: TaskType;
  /** dedupeKey + (loglama) için mantıksal varlık tipi, ör. "KPI". */
  entityType: string;
  /** dedupeKey için varlık kimliği. */
  entityId: string;
  /** İdempotans dönemi (ör. "2026-M05"); dönemden bağımsız görevlerde boş. */
  periodKey?: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: Date | null;
  escalationLevel?: number;
  assigneeId?: string | null;
  assigneeDeptId?: string | null;
  links?: SystemTaskLinks;
}

export interface UpsertSystemTaskResult {
  task: Task;
  /** true = yeni oluşturuldu; false = aynı dedupeKey'li açık görev zaten vardı (atlandı). */
  created: boolean;
}

/**
 * SYSTEM görevini idempotan biçimde oluşturur (INV-2): aynı
 * `(type, entityType, entityId, periodKey)` için en fazla bir görev.
 *
 * Önce dedupeKey ile arar (aynı tx içinde catch-and-continue Postgres'te tx'i abort
 * ettiğinden create-then-catch yerine find-then-create tercih edilir). Eşzamanlı bir
 * yarış olursa `dedupeKey @unique` kısıtı bütünlüğü korur; çakışan create fırlatır ve
 * çağıranın işlemi geri alınır (idempotan olduğundan yeniden çalıştırma güvenlidir).
 */
export async function upsertSystemTask(
  tx: Prisma.TransactionClient,
  input: UpsertSystemTaskInput,
): Promise<UpsertSystemTaskResult> {
  const dedupeKey = buildDedupeKey(input.type, input.entityType, input.entityId, input.periodKey);

  const existing = await tx.task.findUnique({ where: { dedupeKey } });
  if (existing) {
    logEvent("info", "task.skipped_duplicate", {
      taskId: existing.id,
      type: input.type,
      dedupeKey,
    });
    return { task: existing, created: false };
  }

  const task = await tx.task.create({
    data: {
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      source: "SYSTEM",
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate ?? null,
      escalationLevel: input.escalationLevel ?? 0,
      periodKey: input.periodKey ?? null,
      dedupeKey,
      assigneeId: input.assigneeId ?? null,
      assigneeDeptId: input.assigneeDeptId ?? null,
      kpiId: input.links?.kpiId ?? null,
      kpiPeriodRecordId: input.links?.kpiPeriodRecordId ?? null,
      countermeasureId: input.links?.countermeasureId ?? null,
      actionPlanId: input.links?.actionPlanId ?? null,
      decisionId: input.links?.decisionId ?? null,
    },
  });
  logEvent("info", "task.created", { taskId: task.id, type: input.type, dedupeKey });
  return { task, created: true };
}
