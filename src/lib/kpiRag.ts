import type { KpiRagColor } from "@/lib/domainTypes";

export type RagThresholds = { amberThreshold: number; redThreshold: number };

export function computePercentVariance(actual: number, target: number): number {
  if (target === 0) return 0;
  return ((actual - target) / target) * 100;
}

/**
 * Sapma %’si: redThreshold ve altı → KIRMIZI; negatif sapmada amberThreshold ve altı → SARI; aksi YEŞİL.
 * Eşikler veritabanı / ayarlardan (ör. -10 kırmızı, -5 sarı).
 */
export function computeKpiRagFromVariancePercent(
  percentVariance: number,
  thresholds: RagThresholds
): KpiRagColor {
  if (percentVariance <= thresholds.redThreshold) return "RED";
  if (percentVariance < 0 && percentVariance <= thresholds.amberThreshold) return "AMBER";
  return "GREEN";
}

export function shouldAutoOpenCountermeasure(status: KpiRagColor): boolean {
  return status === "RED";
}
