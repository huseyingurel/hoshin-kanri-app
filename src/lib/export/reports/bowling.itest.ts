import { describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { getReport, type ReportContext } from "@/lib/export/reports";
import { buildPdf } from "@/lib/export/pdf";
import type { UserScope } from "@/lib/dataScope";
import { seedReportingData } from "../../../../test/fixtures/seedReportingData";

const report = getReport("bowling")!;
const pmo = (id: string): UserScope => ({ id, role: "PMO", departmentId: null });

describe("bowling raporu (entegrasyon)", () => {
  it("KPI × dönem matrisi üretir ve %PDF Buffer döner", async () => {
    const seed = await seedReportingData(prisma);
    const ctx: ReportContext = { db: prisma, scope: pmo(seed.pmoId), filters: {} };
    const data = (await report.fetch(ctx)) as { periods: string[]; rows: unknown[] };
    expect(data.periods.length).toBeGreaterThanOrEqual(2); // 2025-05 + 2026-05
    expect(data.rows.length).toBeGreaterThanOrEqual(2); // 2026 + 2025 KPI

    const buf = await buildPdf(report.toPdf(data, ctx));
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("year filtresi matrisi o yıla daraltır", async () => {
    const seed = await seedReportingData(prisma);
    const ctx: ReportContext = { db: prisma, scope: pmo(seed.pmoId), filters: { year: 2025 } };
    const data = (await report.fetch(ctx)) as { periods: string[] };
    expect(data.periods).toEqual(["2025-05"]);
  });
});
