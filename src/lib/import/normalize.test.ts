/**
 * Birim testleri: normalizeRow
 *
 * FR-13 regresyon koruması: bilinmeyen raporlama sıklığı → RowError, asla MONTHLY değil.
 */

import { describe, expect, it } from "vitest";
import { normalizeRow } from "./normalize";
import type { MappedRow } from "./mapping";
import type { NormalizedRow, RowError } from "./normalize";

function makeRow(overrides: Partial<MappedRow> = {}): MappedRow {
  return {
    hoshinTitle:     "H1 – Test Hoshin",
    majorTaskTitle:  "Ana Görev 1",
    actionPlanTitle: "Plan A",
    kpiName:         "Verimlilik",
    departmentNames: ["Üretim"],
    targetRaw:       "100",
    frequencyRaw:    "Monthly",
    unitRaw:         "",
    yearRaw:         "",
    kpiDescription:  "",
    _raw:            {},
    _rowIndex:       0,
    ...overrides,
  };
}

describe("normalizeRow — başarılı durumlar", () => {
  it("İngilizce bilinen alias'lar doğru sıklığa eşlenir", () => {
    const cases: Array<[string, string]> = [
      ["Monthly",     "MONTHLY"],
      ["monthly",     "MONTHLY"],
      ["Quarterly",   "QUARTERLY"],
      ["quarterly",   "QUARTERLY"],
      ["Half Yearly", "HALF_YEAR"],
      ["half-year",   "HALF_YEAR"],
      ["Annual",      "ANNUAL"],
      ["annually",    "ANNUAL"],
      ["yearly",      "ANNUAL"],
    ];
    for (const [raw, expected] of cases) {
      const result = normalizeRow(makeRow({ frequencyRaw: raw }));
      expect(result.kind, `"${raw}" için kind`).toBe("ok");
      expect((result as NormalizedRow).reportingFrequency, `"${raw}" → frekans`).toBe(expected);
    }
  });

  it("Türkçe bilinen alias'lar doğru sıklığa eşlenir", () => {
    const cases: Array<[string, string]> = [
      ["Aylık",    "MONTHLY"],
      ["aylık",    "MONTHLY"],
      ["Çeyrek",   "QUARTERLY"],
      ["Yarıyıl",  "HALF_YEAR"],
      ["Yıllık",   "ANNUAL"],
    ];
    for (const [raw, expected] of cases) {
      const result = normalizeRow(makeRow({ frequencyRaw: raw }));
      expect(result.kind, `"${raw}" için kind`).toBe("ok");
      expect((result as NormalizedRow).reportingFrequency, `"${raw}" → frekans`).toBe(expected);
    }
  });

  it("Hedef değeri sayı + birim olarak ayrıştırılır", () => {
    const result = normalizeRow(makeRow({ targetRaw: "≤ 15 PPM" })) as NormalizedRow;
    expect(result.kind).toBe("ok");
    expect(result.targetValue).toBe(15);
    expect(result.unit).toContain("PPM");
  });

  it("Yüzde hedefi birim olarak '%' içerir", () => {
    const result = normalizeRow(makeRow({ targetRaw: "%95" })) as NormalizedRow;
    expect(result.kind).toBe("ok");
    expect(result.targetValue).toBe(95);
    expect(result.unit).toContain("%");
  });

  it("Ayrı unit sütunu varsa onu kullanır", () => {
    const result = normalizeRow(makeRow({ unitRaw: "Adet", targetRaw: "500" })) as NormalizedRow;
    expect(result.kind).toBe("ok");
    expect(result.unit).toBe("Adet");
  });

  it("Yıl sütunu geçerliyse kullanır", () => {
    const result = normalizeRow(makeRow({ yearRaw: "2025" })) as NormalizedRow;
    expect(result.kind).toBe("ok");
    expect(result.hoshinYear).toBe(2025);
  });

  it("Yıl sütunu yoksa 2026 varsayar", () => {
    const result = normalizeRow(makeRow({ yearRaw: "" })) as NormalizedRow;
    expect(result.kind).toBe("ok");
    expect(result.hoshinYear).toBe(2026);
  });
});

describe("normalizeRow — hata durumları", () => {
  // FR-13 regresyon koruması
  it("Bilinmeyen sıklık → RowError (asla MONTHLY değil)", () => {
    const result = normalizeRow(makeRow({ frequencyRaw: "bilinmeyen_sıklık_xyz" }));
    expect(result.kind).toBe("error");
    const err = result as RowError;
    expect(err.field).toBe("frequency");
    expect(err.reason).toContain("bilinmeyen_sıklık_xyz");
    // Regresyon: MONTHLY değerine düşmediğini doğrula
    expect(result).not.toMatchObject({ reportingFrequency: "MONTHLY" });
  });

  it("Boş sıklık → RowError (FR-13: sessiz MONTHLY'ye düşme yasak)", () => {
    const result = normalizeRow(makeRow({ frequencyRaw: "" }));
    expect(result.kind).toBe("error");
    const err = result as RowError;
    expect(err.field).toBe("frequency");
    expect(result).not.toMatchObject({ reportingFrequency: "MONTHLY" });
  });

  it("Hoshin başlığı boş → RowError", () => {
    const result = normalizeRow(makeRow({ hoshinTitle: "" })) as RowError;
    expect(result.kind).toBe("error");
    expect(result.field).toBe("hoshin");
  });

  it("Ana görev başlığı boş → RowError", () => {
    const result = normalizeRow(makeRow({ majorTaskTitle: "" })) as RowError;
    expect(result.kind).toBe("error");
    expect(result.field).toBe("majorTask");
  });

  it("Aksiyon planı başlığı boş → RowError", () => {
    const result = normalizeRow(makeRow({ actionPlanTitle: "" })) as RowError;
    expect(result.kind).toBe("error");
    expect(result.field).toBe("actionPlan");
  });

  it("KPI adı boş → RowError", () => {
    const result = normalizeRow(makeRow({ kpiName: "" })) as RowError;
    expect(result.kind).toBe("error");
    expect(result.field).toBe("kpiName");
  });
});
