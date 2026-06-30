import { describe, expect, it } from "vitest";
import {
  duePeriodsAsOf,
  normalizeReportingFrequency,
  parseFrequency,
  periodKeyFor,
  periodsPerYear,
  periodWindow,
} from "@/lib/engine/calendar";

// UTC-açık tarihler (zaman dilimine bağımlı olmamak için)
const utc = (y: number, m1: number, d = 1) => new Date(Date.UTC(y, m1 - 1, d));

describe("periodKeyFor", () => {
  it("MONTHLY: yıl + sıfır dolgulu ay", () => {
    expect(periodKeyFor(utc(2026, 5, 15), "MONTHLY")).toBe("2026-M05");
    expect(periodKeyFor(utc(2026, 12, 31), "MONTHLY")).toBe("2026-M12");
    expect(periodKeyFor(utc(2026, 1, 1), "MONTHLY")).toBe("2026-M01");
  });

  it("QUARTERLY: çeyrek 1-4", () => {
    expect(periodKeyFor(utc(2026, 1, 1), "QUARTERLY")).toBe("2026-Q1");
    expect(periodKeyFor(utc(2026, 3, 31), "QUARTERLY")).toBe("2026-Q1");
    expect(periodKeyFor(utc(2026, 4, 1), "QUARTERLY")).toBe("2026-Q2");
    expect(periodKeyFor(utc(2026, 12, 1), "QUARTERLY")).toBe("2026-Q4");
  });

  it("HALF_YEAR: yarıyıl 1-2", () => {
    expect(periodKeyFor(utc(2026, 6, 30), "HALF_YEAR")).toBe("2026-H1");
    expect(periodKeyFor(utc(2026, 7, 1), "HALF_YEAR")).toBe("2026-H2");
  });

  it("ANNUAL: yalnız yıl", () => {
    expect(periodKeyFor(utc(2026, 8, 20), "ANNUAL")).toBe("2026-A");
  });
});

describe("periodWindow", () => {
  it("MONTHLY: ayın ilk anı → son ms", () => {
    const { periodStart, periodEnd } = periodWindow(utc(2026, 5, 15), "MONTHLY");
    expect(periodStart.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-05-31T23:59:59.999Z");
  });

  it("QUARTERLY: çeyrek sınırları", () => {
    const { periodStart, periodEnd } = periodWindow(utc(2026, 5, 15), "QUARTERLY");
    expect(periodStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-06-30T23:59:59.999Z");
  });

  it("ANNUAL: yıl başı → yıl sonu (Aralık dahil, yıl taşması)", () => {
    const { periodStart, periodEnd } = periodWindow(utc(2026, 12, 31), "ANNUAL");
    expect(periodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("HALF_YEAR: ikinci yarı Aralık taşmasını doğru kapatır", () => {
    const { periodStart, periodEnd } = periodWindow(utc(2026, 11, 1), "HALF_YEAR");
    expect(periodStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("duePeriodsAsOf", () => {
  it("yıl ortasında: o ana kadar başlamış aylar", () => {
    // 15 Mayıs 2026 → Ocak..Mayıs açılmış olmalı
    expect(duePeriodsAsOf(utc(2026, 5, 15), "MONTHLY", 2026)).toEqual([
      "2026-M01",
      "2026-M02",
      "2026-M03",
      "2026-M04",
      "2026-M05",
    ]);
  });

  it("mali yıldan önce: boş", () => {
    expect(duePeriodsAsOf(utc(2025, 12, 31), "QUARTERLY", 2026)).toEqual([]);
  });

  it("mali yıl tamamen geçmiş: tüm dönemler", () => {
    expect(duePeriodsAsOf(utc(2027, 1, 1), "QUARTERLY", 2026)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
    ]);
  });

  it("dönem başlangıç anı kapsayıcıdır (<=)", () => {
    // Tam olarak 1 Nisan 00:00:00Z → Q2 açılmış sayılır
    expect(duePeriodsAsOf(utc(2026, 4, 1), "QUARTERLY", 2026)).toEqual(["2026-Q1", "2026-Q2"]);
  });
});

describe("periodsPerYear", () => {
  it("sıklık başına dönem sayısı", () => {
    expect(periodsPerYear("MONTHLY")).toBe(12);
    expect(periodsPerYear("QUARTERLY")).toBe(4);
    expect(periodsPerYear("HALF_YEAR")).toBe(2);
    expect(periodsPerYear("ANNUAL")).toBe(1);
  });
});

describe("bilinmeyen sıklıkta sessizce undefined dönmez (fırlatır)", () => {
  // Çalışma zamanında DB'den gelen bozuk bir sıklık değeri için: undefined yerine hata.
  const bogus = "BOGUS" as never;
  it("periodKeyFor fırlatır", () => {
    expect(() => periodKeyFor(utc(2026, 1, 1), bogus)).toThrow();
  });
  it("periodWindow fırlatır", () => {
    expect(() => periodWindow(utc(2026, 1, 1), bogus)).toThrow();
  });
  it("periodsPerYear fırlatır", () => {
    expect(() => periodsPerYear(bogus)).toThrow();
  });
});

describe("parseFrequency", () => {
  it("geçerli sıklıkları döner", () => {
    expect(parseFrequency("MONTHLY")).toBe("MONTHLY");
    expect(parseFrequency("ANNUAL")).toBe("ANNUAL");
  });

  it("geçersiz sıklıkta fırlatır (sessiz dönüş yok)", () => {
    expect(() => parseFrequency("WEEKLY")).toThrow();
    expect(() => parseFrequency("")).toThrow();
  });
});

describe("normalizeReportingFrequency", () => {
  it("dört sıklığın da yaygın İngilizce yazımlarını eşler", () => {
    expect(normalizeReportingFrequency("Monthly")).toBe("MONTHLY");
    expect(normalizeReportingFrequency("Quarterly")).toBe("QUARTERLY");
    expect(normalizeReportingFrequency("Half-Yearly")).toBe("HALF_YEAR");
    expect(normalizeReportingFrequency("Semi-Annual")).toBe("HALF_YEAR");
    expect(normalizeReportingFrequency("Annual")).toBe("ANNUAL");
    expect(normalizeReportingFrequency("Yearly")).toBe("ANNUAL");
  });

  it("Türkçe yazımları ve büyük/küçük harf + boşluk farklarını tolere eder", () => {
    expect(normalizeReportingFrequency("aylık")).toBe("MONTHLY");
    expect(normalizeReportingFrequency("Üç Aylık")).toBe("QUARTERLY");
    expect(normalizeReportingFrequency(" YARIYIL ")).toBe("HALF_YEAR");
    expect(normalizeReportingFrequency("Yıllık")).toBe("ANNUAL");
  });

  it("HALF_YEAR / ANNUAL artık QUARTERLY'ye sessizce düşmez (FR-13)", () => {
    expect(normalizeReportingFrequency("ANNUAL")).toBe("ANNUAL");
    expect(normalizeReportingFrequency("HALF_YEAR")).toBe("HALF_YEAR");
  });

  it("tanınmayan değerde null döner (çağıran karar verir, sessiz coercion yok)", () => {
    expect(normalizeReportingFrequency("Weekly")).toBeNull();
    expect(normalizeReportingFrequency("")).toBeNull();
    expect(normalizeReportingFrequency("zırva")).toBeNull();
  });
});
