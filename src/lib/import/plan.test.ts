/**
 * Birim testleri: buildImportPlan
 *
 * Doğal anahtar eşleme ile create/update/dupe/error sınıflandırmasını doğrular.
 * Yinelenen oluşturma hatasının düzeltildiğini (import-excel.ts'deki bug) regresyon olarak korur.
 */

import { describe, expect, it } from "vitest";
import { buildImportPlan, type ExistingIndex } from "./plan";
import type { NormalizedRow, RowError } from "./normalize";
import type { MappedRow } from "./mapping";

// ---------------------------------------------------------------------------
// Test verisi yardımcıları
// ---------------------------------------------------------------------------

function makeMappedRow(overrides: Partial<MappedRow> = {}): MappedRow {
  return {
    hoshinTitle:    "H1",
    majorTaskTitle: "MT1",
    actionPlanTitle: "AP1",
    kpiName:        "KPI1",
    departmentNames: ["Üretim"],
    targetRaw:      "100",
    frequencyRaw:   "Monthly",
    unitRaw:        "",
    yearRaw:        "",
    kpiDescription: "",
    _raw:           {},
    _rowIndex:      0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    kind:               "ok",
    rowIndex:           0,
    hoshinTitle:        "H1",
    hoshinYear:         2026,
    majorTaskTitle:     "MT1",
    actionPlanTitle:    "AP1",
    kpiName:            "KPI1",
    kpiDescription:     "",
    departmentNames:    ["Üretim"],
    targetValue:        100,
    unit:               "Adet",
    reportingFrequency: "MONTHLY",
    _raw:               makeMappedRow(),
    ...overrides,
  };
}

function makeError(overrides: Partial<RowError> = {}): RowError {
  return {
    kind:     "error",
    rowIndex: 0,
    field:    "frequency",
    reason:   "Bilinmeyen sıklık",
    _raw:     makeMappedRow(),
    ...overrides,
  };
}

function emptyIndex(): ExistingIndex {
  return {
    hoshins:     new Map(),
    departments: new Map(),
    majorTasks:  new Map(),
    actionPlans: new Map(),
    kpis:        new Map(),
  };
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe("buildImportPlan — boş DB (yalnız creates)", () => {
  it("DB boşsa tüm geçerli satırlar creates'e düşer", () => {
    const rows = [
      makeRow({ rowIndex: 0, kpiName: "KPI1" }),
      makeRow({ rowIndex: 1, kpiName: "KPI2" }),
    ];
    const plan = buildImportPlan(rows, emptyIndex());
    expect(plan.creates).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
    expect(plan.dupes).toHaveLength(0);
    expect(plan.errors).toHaveLength(0);
  });

  it("RowError olan satırlar errors'e düşer, creates'e değil", () => {
    const err = makeError({ rowIndex: 2 });
    const plan = buildImportPlan([err], emptyIndex());
    expect(plan.errors).toHaveLength(1);
    expect(plan.creates).toHaveLength(0);
  });
});

describe("buildImportPlan — mevcut DB (update/dupe)", () => {
  function indexWithKpi(kpiId: string, target = 100, unit = "Adet", freq = "MONTHLY"): ExistingIndex {
    const hoshinId = "hoshin1";
    const mtId = "mt1";
    const apId = "ap1";
    return {
      hoshins:     new Map([["H1|2026", { id: hoshinId }]]),
      departments: new Map([["Üretim", { id: "dept1" }]]),
      majorTasks:  new Map([[`${hoshinId}|MT1`, { id: mtId }]]),
      actionPlans: new Map([[`${mtId}|AP1`, { id: apId }]]),
      kpis:        new Map([[`${apId}|KPI1`, { id: kpiId, targetYear: target, unit, reportingFrequency: freq }]]),
    };
  }

  it("KPI mevcut ve alanlar aynı → dupe", () => {
    const plan = buildImportPlan(
      [makeRow({ targetValue: 100, unit: "Adet", reportingFrequency: "MONTHLY" })],
      indexWithKpi("kpi-existing", 100, "Adet", "MONTHLY"),
    );
    expect(plan.dupes).toHaveLength(1);
    expect(plan.dupes[0].existingKpiId).toBe("kpi-existing");
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("KPI mevcut ama targetValue farklı → update", () => {
    const plan = buildImportPlan(
      [makeRow({ targetValue: 200, unit: "Adet", reportingFrequency: "MONTHLY" })],
      indexWithKpi("kpi-existing", 100, "Adet", "MONTHLY"),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].existingKpiId).toBe("kpi-existing");
    expect(plan.creates).toHaveLength(0);
    expect(plan.dupes).toHaveLength(0);
  });

  it("KPI mevcut ama sıklık farklı → update", () => {
    const plan = buildImportPlan(
      [makeRow({ reportingFrequency: "QUARTERLY" })],
      indexWithKpi("kpi-existing", 100, "Adet", "MONTHLY"),
    );
    expect(plan.updates).toHaveLength(1);
  });

  it("KPI mevcut ama birim farklı → update", () => {
    const plan = buildImportPlan(
      [makeRow({ unit: "%" })],
      indexWithKpi("kpi-existing", 100, "Adet", "MONTHLY"),
    );
    expect(plan.updates).toHaveLength(1);
  });

  it("Hoshin mevcut değilse → create (hiyerarşi atraverse edilmeden)", () => {
    const existing: ExistingIndex = {
      ...emptyIndex(),
      departments: new Map([["Üretim", { id: "dept1" }]]),
      // hoshins boş
    };
    const plan = buildImportPlan([makeRow()], existing);
    expect(plan.creates).toHaveLength(1);
    expect(plan.dupes).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("MajorTask mevcut değilse → create", () => {
    const existing: ExistingIndex = {
      ...emptyIndex(),
      hoshins: new Map([["H1|2026", { id: "hoshin1" }]]),
      // majorTasks boş
    };
    const plan = buildImportPlan([makeRow()], existing);
    expect(plan.creates).toHaveLength(1);
  });

  it("ActionPlan mevcut değilse → create", () => {
    const existing: ExistingIndex = {
      ...emptyIndex(),
      hoshins:    new Map([["H1|2026", { id: "hoshin1" }]]),
      majorTasks: new Map([["hoshin1|MT1", { id: "mt1" }]]),
      // actionPlans boş
    };
    const plan = buildImportPlan([makeRow()], existing);
    expect(plan.creates).toHaveLength(1);
  });
});

describe("buildImportPlan — toplu yineleme tespiti (duplicate-create bug düzeltmesi)", () => {
  it("Aynı dosyada aynı KPI iki kez görünüyorsa ikincisi dupe olur", () => {
    const rows = [
      makeRow({ rowIndex: 0, kpiName: "KPI1" }),
      makeRow({ rowIndex: 1, kpiName: "KPI1" }), // aynı doğal anahtar
    ];
    const plan = buildImportPlan(rows, emptyIndex());
    expect(plan.creates).toHaveLength(1);
    expect(plan.dupes).toHaveLength(1);
    expect(plan.dupes[0].existingKpiId).toBe("__batch_dupe__");
  });

  it("Farklı hoshin'ler için aynı KPI adı birbirini etkilemez", () => {
    const rows = [
      makeRow({ rowIndex: 0, hoshinTitle: "H1", kpiName: "KPI1" }),
      makeRow({ rowIndex: 1, hoshinTitle: "H2", kpiName: "KPI1" }),
    ];
    const plan = buildImportPlan(rows, emptyIndex());
    expect(plan.creates).toHaveLength(2);
    expect(plan.dupes).toHaveLength(0);
  });

  it("Farklı actionPlan'lar için aynı KPI adı birbirini etkilemez", () => {
    const rows = [
      makeRow({ rowIndex: 0, actionPlanTitle: "AP1", kpiName: "KPI1" }),
      makeRow({ rowIndex: 1, actionPlanTitle: "AP2", kpiName: "KPI1" }),
    ];
    const plan = buildImportPlan(rows, emptyIndex());
    expect(plan.creates).toHaveLength(2);
    expect(plan.dupes).toHaveLength(0);
  });
});

describe("buildImportPlan — karışık giriş", () => {
  it("Hata, create, dupe karışık girişte her biri doğru sınıfa gider", () => {
    const hoshinId = "h1";
    const mtId = "mt1";
    const apId = "ap1";
    const existing: ExistingIndex = {
      hoshins:     new Map([["H1|2026", { id: hoshinId }]]),
      departments: new Map([["Üretim", { id: "dept1" }]]),
      majorTasks:  new Map([[`${hoshinId}|MT1`, { id: mtId }]]),
      actionPlans: new Map([[`${mtId}|AP1`, { id: apId }]]),
      kpis:        new Map([[`${apId}|KPI_EXISTING`, { id: "kpi1", targetYear: 100, unit: "Adet", reportingFrequency: "MONTHLY" }]]),
    };

    const items = [
      makeRow({ rowIndex: 0, kpiName: "KPI_NEW" }),              // create
      makeRow({ rowIndex: 1, kpiName: "KPI_EXISTING" }),          // dupe (aynı alanlar)
      makeError({ rowIndex: 2 }),                                  // error
      makeRow({ rowIndex: 3, kpiName: "KPI_NEW" }),               // batch dupe (2. kez aynı)
    ];

    const plan = buildImportPlan(items, existing);
    expect(plan.creates).toHaveLength(1);
    expect(plan.dupes).toHaveLength(2);  // DB dupe + batch dupe
    expect(plan.errors).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });
});
