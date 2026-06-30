/**
 * Excel tamponunu ham satırlara dönüştürür. SAF modül: I/O yok, prisma yok.
 * import-excel.ts ile aynı xlsx.read + sheet_to_json yöntemini kullanır.
 */

import * as xlsx from "xlsx";

/** Ham Excel hücresi: string, sayı ya da boş. */
export type RawRow = Record<string, string | number | null>;

export interface ParsedSheet {
  headers: string[];
  rows: RawRow[];
}

/**
 * Excel/XLSX tamponunu parse eder; ilk çalışma sayfasını kullanır.
 * Tüm hücre değerleri string | number | null olarak normalize edilir (defval: null).
 */
export function sheetToRows(buffer: Buffer): ParsedSheet {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  const raw = xlsx.utils.sheet_to_json<RawRow>(sheet, { defval: null });
  const headers = raw.length > 0 ? Object.keys(raw[0]) : [];
  return { headers, rows: raw };
}
