/**
 * MappedRow'ları normalize edilmiş, tip-güvenli alanlara dönüştürür. SAF modül: I/O yok, prisma yok.
 *
 * FR-13 regresyon koruması: bilinmeyen raporlama sıklığı kesinlikle RowError döner —
 * import-excel.ts'deki sessiz MONTHLY'ye düşme davranışı burada **yasaktır**.
 */

import { normalizeReportingFrequency } from "@/lib/engine/calendar";
import type { ReportingFrequency } from "@/lib/domainTypes";
import type { MappedRow } from "./mapping";

/** Satır doğrulanamadığında döner. */
export interface RowError {
  kind: "error";
  rowIndex: number;
  /** Hangi mantıksal alan başarısız oldu. */
  field: string;
  /** Türkçe hata açıklaması. */
  reason: string;
  _raw: MappedRow;
}

/** Normalize edilmiş, commit'e hazır satır. */
export interface NormalizedRow {
  kind: "ok";
  rowIndex: number;
  hoshinTitle: string;
  hoshinYear: number;
  majorTaskTitle: string;
  actionPlanTitle: string;
  kpiName: string;
  kpiDescription: string;
  departmentNames: string[];
  targetValue: number;
  unit: string;
  reportingFrequency: ReportingFrequency;
  _raw: MappedRow;
}

/**
 * Hedef metnini (ör. "≤ 15 PPM", "%95", "100") sayı + birime ayırır.
 */
function parseTarget(raw: string): { value: number; unit: string } {
  if (!raw) return { value: 0, unit: "Adet" };
  const isPercent = raw.includes("%");
  const clean = raw.replace(/[≤≥]/g, "").trim();
  const match = clean.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return { value: 0, unit: clean || "Adet" };
  const value = parseFloat(match[1].replace(",", "."));
  const unitPart = clean.replace(match[0], "").replace(/%/g, "").trim();
  const unit = isPercent
    ? ("%" + (unitPart ? " " + unitPart : "")).trim()
    : unitPart || "Adet";
  return { value, unit };
}

/**
 * Bir MappedRow'u NormalizedRow'a ya da RowError'a dönüştürür.
 *
 * Bilinmeyen raporlama sıklığı → RowError. MONTHLY'ye DÜŞMEZ (FR-13).
 */
export function normalizeRow(row: MappedRow): NormalizedRow | RowError {
  const err = (field: string, reason: string): RowError => ({
    kind: "error",
    rowIndex: row._rowIndex,
    field,
    reason,
    _raw: row,
  });

  if (!row.hoshinTitle)     return err("hoshin",     "Hoshin başlığı boş");
  if (!row.majorTaskTitle)  return err("majorTask",  "Ana görev başlığı boş");
  if (!row.actionPlanTitle) return err("actionPlan", "Aksiyon planı başlığı boş");
  if (!row.kpiName)         return err("kpiName",    "KPI adı boş");

  // Raporlama sıklığı — bilinmeyen → RowError (FR-13: sessiz MONTHLY'ye düşme yasak)
  const freq = normalizeReportingFrequency(row.frequencyRaw ?? "");
  if (!freq) {
    return err(
      "frequency",
      `Bilinmeyen raporlama sıklığı: "${row.frequencyRaw}" ` +
        `(geçerli: monthly/quarterly/half_year/annual veya Türkçe yazımları)`,
    );
  }

  // Yıl: sütundan al; yoksa 2026 varsay
  let hoshinYear = 2026;
  if (row.yearRaw) {
    const parsed = parseInt(row.yearRaw, 10);
    if (!isNaN(parsed) && parsed > 2000) hoshinYear = parsed;
  }

  const { value: targetValue, unit: parsedUnit } = parseTarget(row.targetRaw);
  // Ayrı unit sütunu varsa onu tercih et; yoksa hedef metninden çıkarılanı kullan
  const unit = row.unitRaw || parsedUnit || "Adet";

  return {
    kind: "ok",
    rowIndex: row._rowIndex,
    hoshinTitle:        row.hoshinTitle,
    hoshinYear,
    majorTaskTitle:     row.majorTaskTitle,
    actionPlanTitle:    row.actionPlanTitle,
    kpiName:            row.kpiName,
    kpiDescription:     row.kpiDescription || "",
    departmentNames:    row.departmentNames.length > 0 ? row.departmentNames : ["Genel"],
    targetValue,
    unit,
    reportingFrequency: freq,
    _raw: row,
  };
}
