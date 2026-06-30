/**
 * Entegrasyon testleri: importActions
 *
 * Gerçek DB kullanır. Auth + next/cache mock'lanır (diğer itests ile aynı örüntü).
 * NOT: Bu dosya `.itest.ts` uzantılıdır; `npm test` ile çalışmaz.
 * Orkestratör `npm run test:int` veya doğrudan vitest ile çalıştırır.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { previewImport, commitImport } from "@/app/actions/importActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import type { RawRow } from "@/lib/import/parse";
import type { ColumnMapping } from "@/lib/import/mapping";
import type { ImportPlan } from "@/lib/import/plan";

// ---------------------------------------------------------------------------
// Test verisi
// ---------------------------------------------------------------------------

const TEST_MAPPING: ColumnMapping = {
  hoshin:      "Hoshin",
  majorTask:   "Major Tasks",
  actionPlan:  "Action Plan",
  kpiName:     "KPI",
  department:  "Resp. Dept.",
  target:      "FY2026 Target",
  frequency:   "Reporting Frequency",
  unit:        "",
  year:        "",
  kpiDescription: "",
};

function makeRows(overrides: Record<string, string>[] = [{}]): RawRow[] {
  const defaults: Record<string, string> = {
    "Hoshin":               "H1 – İçe Aktarım Testi",
    "Major Tasks":          "Ana Görev İT",
    "Action Plan":          "Aksiyon Planı İT",
    "KPI":                  "Test KPI 1",
    "Resp. Dept.":          "İçe Aktarım Dept",
    "FY2026 Target":        "100",
    "Reporting Frequency":  "Monthly",
  };
  return overrides.map((o) => ({ ...defaults, ...o } as RawRow));
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe("importActions entegrasyon", () => {
  afterEach(async () => {
    h.userId = null;
    // Test verilerini temizle (hoshin başlığı prefix'e göre)
    await prisma.hoshin.deleteMany({ where: { title: { startsWith: "H1 – İçe Aktarım" } } });
    await prisma.department.deleteMany({ where: { name: "İçe Aktarım Dept" } });
  });

  // --- previewImport → commitImport ---

  it("previewImport planı oluşturur; commitImport planı kalıcı hale getirir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const rows = makeRows();
    const plan = await previewImport(rows, TEST_MAPPING);

    expect(plan.creates).toHaveLength(1);
    expect(plan.errors).toHaveLength(0);

    const result = await commitImport(plan);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    // DB'de KPI oluşturulmuş mu?
    const kpi = await prisma.kPI.findFirst({ where: { name: "Test KPI 1" } });
    expect(kpi).not.toBeNull();
    expect(kpi!.targetYear).toBe(100);
    expect(kpi!.reportingFrequency).toBe("MONTHLY");
  });

  it("İkinci commit aynı satırları oluşturmaz — dupe/update olarak sınıflandırır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const rows = makeRows();

    // İlk commit
    const plan1 = await previewImport(rows, TEST_MAPPING);
    const r1 = await commitImport(plan1);
    expect(r1.success).toBe(true);

    // DB'deki KPI sayısını kaydet
    const countBefore = await prisma.kPI.count({ where: { name: "Test KPI 1" } });

    // İkinci preview → şimdi KPI DB'de var
    const plan2 = await previewImport(rows, TEST_MAPPING);
    // İkinci planda create yok, dupe ya da update var
    expect(plan2.creates).toHaveLength(0);

    const r2 = await commitImport(plan2);
    expect(r2.success).toBe(true);
    if (!r2.success) return;

    // Yeni KPI oluşturulmamış
    const countAfter = await prisma.kPI.count({ where: { name: "Test KPI 1" } });
    expect(countAfter).toBe(countBefore);
    expect(r2.created).toBe(0);
  });

  it("Birden fazla satır: her KPI için denetim kaydı yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const rows = makeRows([
      { "KPI": "Test KPI A" },
      { "KPI": "Test KPI B", "Action Plan": "Aksiyon Planı İT B" },
    ]);

    const plan = await previewImport(rows, TEST_MAPPING);
    expect(plan.creates).toHaveLength(2);

    const result = await commitImport(plan);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.created).toBe(2);

    // Her iki KPI için CREATE denetim kaydı var mı?
    const kpiA = await prisma.kPI.findFirstOrThrow({ where: { name: "Test KPI A" } });
    const kpiB = await prisma.kPI.findFirstOrThrow({ where: { name: "Test KPI B" } });

    const auditA = await prisma.auditLog.count({
      where: { action: "CREATE", entityType: "KPI", entityId: kpiA.id },
    });
    const auditB = await prisma.auditLog.count({
      where: { action: "CREATE", entityType: "KPI", entityId: kpiB.id },
    });

    expect(auditA).toBe(1);
    expect(auditB).toBe(1);
  });

  it("Transaction rollback: recordAudit fırlatırsa hiçbir kayıt kalıcı olmaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const rows = makeRows([
      { "KPI": "Rollback KPI 1" },
      { "KPI": "Rollback KPI 2" },
    ]);
    const plan = await previewImport(rows, TEST_MAPPING);
    expect(plan.creates).toHaveLength(2);

    // KPI sayısını başlangıçta kaydet
    const countBefore = await prisma.kPI.count();

    // recordAudit'i ilk çağrıda fırlatacak şekilde spy et
    const auditModule = await import("@/lib/engine/audit");
    const spy = vi.spyOn(auditModule, "recordAudit").mockRejectedValueOnce(
      new Error("Simüle edilmiş hata"),
    );

    const result = await commitImport(plan);

    spy.mockRestore();

    // Commit başarısız olmalı
    expect(result.success).toBe(false);

    // DB değişmemiş olmalı (transaction geri alındı)
    const countAfter = await prisma.kPI.count();
    expect(countAfter).toBe(countBefore);

    // Hoshin de oluşturulmamış olmalı
    const hoshin = await prisma.hoshin.findFirst({
      where: { title: "H1 – İçe Aktarım Testi" },
    });
    expect(hoshin).toBeNull();
  });

  it("Oturum yoksa commitImport typed error döner, kayıt olmaz", async () => {
    const seed = await seedGovernance(prisma);
    void seed; // seed oluşturuldu ama userId set edilmeyecek
    h.userId = null;

    // Basit plan oluştur (DB erişimi olmadan)
    const emptyPlan: ImportPlan = { creates: [], updates: [], dupes: [], errors: [] };
    const result = await commitImport(emptyPlan);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/oturum/i);
  });

  it("Update: mevcut KPI'nın alanları değişince güncellenir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // İlk import: targetValue = 100
    const rows1 = makeRows([{ "KPI": "Update Test KPI", "FY2026 Target": "100" }]);
    const plan1 = await previewImport(rows1, TEST_MAPPING);
    await commitImport(plan1);

    // İkinci import: targetValue = 200
    const rows2 = makeRows([{ "KPI": "Update Test KPI", "FY2026 Target": "200" }]);
    const plan2 = await previewImport(rows2, TEST_MAPPING);
    expect(plan2.updates).toHaveLength(1);

    const result2 = await commitImport(plan2);
    expect(result2.success).toBe(true);
    if (!result2.success) return;
    expect(result2.updated).toBe(1);
    expect(result2.created).toBe(0);

    const kpi = await prisma.kPI.findFirstOrThrow({ where: { name: "Update Test KPI" } });
    expect(kpi.targetYear).toBe(200);
  });
});
