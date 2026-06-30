/**
 * Dönem takvimi — saf (I/O yok) yardımcılar. Raporlama sıklığına göre dönem anahtarı,
 * dönem penceresi ve `now` itibarıyla açılmış olması gereken dönemleri hesaplar.
 *
 * Determinizm: `now` ve `fiscalYear` daima parametredir; içeride `Date.now()` çağrılmaz.
 * Zaman dilimi: tüm hesaplar **UTC** üzerinden yapılır (test edilebilirlik + sapma riski yok).
 */

import { REPORTING_FREQUENCIES, type ReportingFrequency } from "@/lib/domainTypes";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Ham string'i geçerli bir raporlama sıklığına çevirir; geçersizse fırlatır (sessiz dönüş yok). */
export function parseFrequency(raw: string): ReportingFrequency {
  if ((REPORTING_FREQUENCIES as readonly string[]).includes(raw)) {
    return raw as ReportingFrequency;
  }
  throw new Error(`Bilinmeyen raporlama sıklığı: ${raw}`);
}

/** Bir yıldaki dönem sayısı (MONTHLY 12, QUARTERLY 4, HALF_YEAR 2, ANNUAL 1). */
export function periodsPerYear(frequency: ReportingFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "HALF_YEAR":
      return 2;
    case "ANNUAL":
      return 1;
    default:
      throw new Error(`Bilinmeyen raporlama sıklığı: ${frequency as string}`);
  }
}

/** Verilen tarihin düştüğü dönemin anahtarı: "2026-M05" / "2026-Q2" / "2026-H1" / "2026-A". */
export function periodKeyFor(date: Date, frequency: ReportingFrequency): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-11
  switch (frequency) {
    case "MONTHLY":
      return `${year}-M${pad2(month + 1)}`;
    case "QUARTERLY":
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case "HALF_YEAR":
      return `${year}-H${month < 6 ? 1 : 2}`;
    case "ANNUAL":
      return `${year}-A`;
    default:
      throw new Error(`Bilinmeyen raporlama sıklığı: ${frequency as string}`);
  }
}

/**
 * Verilen tarihin düştüğü dönemin [başlangıç, bitiş] penceresi (UTC, kapsayıcı).
 * Bitiş, bir sonraki dönemin başlangıcından 1 ms öncesidir (ör. 2026-05-31T23:59:59.999Z).
 */
export function periodWindow(
  date: Date,
  frequency: ReportingFrequency,
): { periodStart: Date; periodEnd: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  let startMonth: number;
  let monthsInPeriod: number;
  switch (frequency) {
    case "MONTHLY":
      startMonth = month;
      monthsInPeriod = 1;
      break;
    case "QUARTERLY":
      startMonth = Math.floor(month / 3) * 3;
      monthsInPeriod = 3;
      break;
    case "HALF_YEAR":
      startMonth = month < 6 ? 0 : 6;
      monthsInPeriod = 6;
      break;
    case "ANNUAL":
      startMonth = 0;
      monthsInPeriod = 12;
      break;
    default:
      throw new Error(`Bilinmeyen raporlama sıklığı: ${frequency as string}`);
  }

  // Date.UTC ay taşmasını otomatik yönetir (ör. ay 12 → sonraki yıl Ocak).
  const periodStart = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const nextStart = new Date(Date.UTC(year, startMonth + monthsInPeriod, 1, 0, 0, 0, 0));
  const periodEnd = new Date(nextStart.getTime() - 1);
  return { periodStart, periodEnd };
}

/**
 * Bir KPI'nın son dönemlerindeki **ardışık RED** sayısını döner (en yeniden geriye).
 * Aynı döneme ait birden çok kayıt (yeniden kaydetme) tek dönem sayılır: periodKey'e göre
 * ilk (en yeni) kayıt o dönemin durumudur. RED olmayan ilk dönemde sayım durur.
 *
 * `records` periodStart'a göre **azalan** (en yeni önce) sıralı verilmelidir.
 */
export function countLeadingConsecutiveRed(
  records: ReadonlyArray<{ periodStart: Date; statusColor: string | null }>,
  frequency: ReportingFrequency,
): number {
  let count = 0;
  let lastKey: string | null = null;
  for (const r of records) {
    const key = periodKeyFor(r.periodStart, frequency);
    if (key === lastKey) continue; // aynı dönemin başka kaydı → atla
    lastKey = key;
    if (r.statusColor === "RED") count++;
    else break;
  }
  return count;
}

/**
 * Verilen mali yıl ve sıklık için, `now` itibarıyla başlamış olan dönemlerin anahtarları.
 * `now` mali yıldan önceyse boş dizi; mali yıl tamamen geçmişse o yılın tüm dönemleri.
 *
 * Varsayım: mali yıl takvim yılıyla hizalıdır (Ocak başlangıçlı). Nisan-Mart gibi kaymış
 * mali yıllar bu POC kapsamında desteklenmez; gerekirse ofsetli bir sürüm eklenir.
 */
export function duePeriodsAsOf(
  now: Date,
  frequency: ReportingFrequency,
  fiscalYear: number,
): string[] {
  const count = periodsPerYear(frequency);
  const monthsPer = 12 / count;
  const nowMs = now.getTime();
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const periodStart = new Date(Date.UTC(fiscalYear, i * monthsPer, 1, 0, 0, 0, 0));
    if (periodStart.getTime() <= nowMs) {
      keys.push(periodKeyFor(periodStart, frequency));
    }
  }
  return keys;
}
