/**
 * Görev yardımcıları — bu dosyada yalnız saf `buildDedupeKey`. Yan etkili `upsertSystemTask`
 * (tx içinde) Faz 3'te eklenir.
 */

import type { TaskType } from "@/lib/domainTypes";

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
