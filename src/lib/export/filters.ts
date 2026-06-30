/**
 * Rapor/dışa-aktarma filtreleri — saf ayrıştırma + doğrulama (Prisma yok).
 *
 * Felsefe: hatalı parametre **sessizce yutulmaz** ya da varsayılana zorlanmaz. Geçersiz
 * `year`/`color` bir `FilterParseError` fırlatır; çağıran (export route) bunu 400'e çevirir.
 * Bu, FR-13 dersinin uygulamasıdır: tanınmayan değeri kabul etmektense açıkça reddet.
 */

import { isKpiRagColor, type KpiRagColor } from "@/lib/domainTypes";

export interface ReportFilters {
  /** Hoshin yılı (FR-42 arşiv navigasyonu da bunu kullanır). */
  year?: number;
  /** Sorumlu departman kimliği. */
  deptId?: string;
  /** Toplantı tutanağı raporu için inceleme kimliği. */
  reviewId?: string;
  /** Tek bir Hoshin'e daraltma. */
  hoshinId?: string;
  /** KPI RAG rengi (son dönem kaydına göre süzme). */
  color?: KpiRagColor;
}

export class FilterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterParseError";
  }
}

/**
 * URLSearchParams → doğrulanmış ReportFilters. Boş/eksik parametreler atlanır.
 * Geçersiz değerler `FilterParseError` fırlatır (sessiz coercion yok).
 */
export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const out: ReportFilters = {};

  const yearRaw = params.get("year");
  if (yearRaw != null && yearRaw !== "") {
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new FilterParseError(`Geçersiz yıl: ${yearRaw}`);
    }
    out.year = year;
  }

  const color = params.get("color");
  if (color != null && color !== "") {
    if (!isKpiRagColor(color)) {
      throw new FilterParseError(`Geçersiz renk: ${color}`);
    }
    out.color = color;
  }

  const deptId = params.get("deptId");
  if (deptId) out.deptId = deptId;

  const reviewId = params.get("reviewId");
  if (reviewId) out.reviewId = reviewId;

  const hoshinId = params.get("hoshinId");
  if (hoshinId) out.hoshinId = hoshinId;

  return out;
}
