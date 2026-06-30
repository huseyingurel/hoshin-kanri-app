/**
 * Sütun eşleme: mantıksal alanlar → gerçek başlık adları. SAF modül: I/O yok, prisma yok.
 */

import type { RawRow } from "./parse";

/** İçe aktarım için gerekli ve opsiyonel mantıksal alanlar. */
export interface ColumnMapping {
  /** Zorunlu */
  hoshin: string;
  majorTask: string;
  actionPlan: string;
  kpiName: string;
  department: string;
  target: string;
  frequency: string;
  /** Opsiyonel */
  unit?: string;
  year?: string;
  kpiDescription?: string;
}

/** Her mantıksal alan için aday başlık örüntüleri (Türkçe/İngilizce). */
const HEURISTICS: Record<keyof ColumnMapping, readonly string[]> = {
  hoshin:         ["hoshin", "hedef", "kpi başlığı"],
  majorTask:      ["major task", "major tasks", "ana görev", "büyük görev"],
  actionPlan:     ["action plan", "aksiyon planı", "aksiyon", "plan"],
  kpiName:        ["kpi", "kpi adı", "gösterge", "performans göstergesi"],
  department:     ["resp. dept.", "resp.dept.", "departman", "department", "sorumlu departman", "bölüm"],
  target:         ["fy2026 target", "target", "hedef değer", "yıllık hedef"],
  frequency:      ["reporting frequency", "frequency", "sıklık", "raporlama sıklığı", "raporlama"],
  unit:           ["unit", "birim"],
  year:           ["year", "yıl", "fy"],
  kpiDescription: ["description", "açıklama", "tanım"],
};

/**
 * Sütun başlıklarına bakarak varsayılan eşlemeyi tahmin eder.
 * Büyük/küçük harf ve baştaki/sondaki boşluklara duyarsız.
 */
export function defaultMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.trim().toLowerCase());

  function findHeader(candidates: readonly string[]): string {
    for (const candidate of candidates) {
      const idx = lower.findIndex(
        (h) => h === candidate || h.includes(candidate),
      );
      if (idx !== -1) return headers[idx];
    }
    return "";
  }

  return {
    hoshin:         findHeader(HEURISTICS.hoshin),
    majorTask:      findHeader(HEURISTICS.majorTask),
    actionPlan:     findHeader(HEURISTICS.actionPlan),
    kpiName:        findHeader(HEURISTICS.kpiName),
    department:     findHeader(HEURISTICS.department),
    target:         findHeader(HEURISTICS.target),
    frequency:      findHeader(HEURISTICS.frequency),
    unit:           findHeader(HEURISTICS.unit),
    year:           findHeader(HEURISTICS.year),
    kpiDescription: findHeader(HEURISTICS.kpiDescription),
  };
}

/** Ham satır eşlenmiş alanlara dönüştürüldükten sonraki yapı. */
export interface MappedRow {
  hoshinTitle: string;
  majorTaskTitle: string;
  actionPlanTitle: string;
  kpiName: string;
  /** "+" ile ayrılmış departman listesi, temizlenmiş. */
  departmentNames: string[];
  targetRaw: string;
  frequencyRaw: string;
  unitRaw: string;
  yearRaw: string;
  kpiDescription: string;
  /** Hata ayıklama için orijinal satır. */
  _raw: RawRow;
  _rowIndex: number;
}

function cellToString(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * Ham satırları eşleme tanımına göre mantıksal alanlara dönüştürür.
 */
export function applyMapping(rows: RawRow[], mapping: ColumnMapping): MappedRow[] {
  return rows.map((row, idx): MappedRow => {
    const deptRaw = cellToString(row[mapping.department] ?? null);
    const deptNames = deptRaw
      ? deptRaw.split("+").map((s) => s.trim()).filter(Boolean)
      : ["Genel"];

    return {
      hoshinTitle:    cellToString(row[mapping.hoshin] ?? null),
      majorTaskTitle: cellToString(row[mapping.majorTask] ?? null),
      actionPlanTitle: cellToString(row[mapping.actionPlan] ?? null),
      kpiName:        cellToString(row[mapping.kpiName] ?? null),
      departmentNames: deptNames,
      targetRaw:      cellToString(mapping.target ? (row[mapping.target] ?? null) : null),
      frequencyRaw:   cellToString(mapping.frequency ? (row[mapping.frequency] ?? null) : null),
      unitRaw:        cellToString(mapping.unit ? (row[mapping.unit] ?? null) : null),
      yearRaw:        cellToString(mapping.year ? (row[mapping.year] ?? null) : null),
      kpiDescription: cellToString(mapping.kpiDescription ? (row[mapping.kpiDescription] ?? null) : null),
      _raw:           row,
      _rowIndex:      idx,
    };
  });
}
