/**
 * Saf Excel (xlsx) üretimi — Prisma yok. Düz veriyi Buffer'a çevirir.
 *
 * Boş veri bir hata değildir: yalnız başlık satırı içeren bir sayfa üretilir (sessizce
 * boş dosya değil — başlıklar her zaman görünür). Çağıran (export route) Buffer'ı yayınlar.
 */

import * as xlsx from "xlsx";

export interface SheetSpec {
  /** Sayfa adı (Excel sekmesi). 31 karakterle sınırlıdır (xlsx kuralı). */
  name: string;
  /** Sütun başlıkları — sabit sıra; satırlar bu anahtarlarla eşlenir. */
  columns: string[];
  /** Her satır: başlık → hücre değeri. Eksik anahtar boş hücredir. */
  rows: Array<Record<string, string | number | null | undefined>>;
}

export interface WorkbookSpec {
  sheets: SheetSpec[];
}

/** 31 karakter Excel sayfa adı sınırı. */
function safeSheetName(name: string): string {
  return name.slice(0, 31) || "Sayfa1";
}

/**
 * WorkbookSpec → xlsx Buffer (`PK` ile başlar). Satırlar `columns` sırasına göre
 * dizilir; başlık satırı her zaman yazılır.
 */
export function buildWorkbook(spec: WorkbookSpec): Buffer {
  const wb = xlsx.utils.book_new();

  const sheets = spec.sheets.length > 0 ? spec.sheets : [{ name: "Sayfa1", columns: [], rows: [] }];
  for (const sheet of sheets) {
    // Başlığı garanti etmek için AOA (array-of-arrays) kullanırız: ilk satır = başlıklar.
    const header = sheet.columns;
    const body = sheet.rows.map((r) => header.map((c) => normalizeCell(r[c])));
    const aoa: Array<Array<string | number>> = [header, ...body];
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    xlsx.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name));
  }

  const out = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

function normalizeCell(v: string | number | null | undefined): string | number {
  if (v == null) return "";
  return v;
}
