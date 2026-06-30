import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import prisma from "@/lib/prisma";
import { getReport, type ReportContext } from "@/lib/export/reports";
import { buildWorkbook } from "@/lib/export/excel";
import type { UserScope } from "@/lib/dataScope";
import { seedReportingData } from "../../../../test/fixtures/seedReportingData";

const report = getReport("kpiStatus")!;

function ctx(scope: UserScope, filters: ReportContext["filters"] = {}): ReportContext {
  return { db: prisma, scope, filters };
}

async function rowsFor(scope: UserScope, filters: ReportContext["filters"] = {}) {
  const data = await report.fetch(ctx(scope, filters));
  return (data as { rows: unknown[] }).rows as Array<Record<string, unknown>>;
}

describe("kpiStatus raporu (entegrasyon)", () => {
  it("rapor kayıt defterinde mevcut", () => {
    expect(report).toBeTruthy();
    expect(report.key).toBe("kpiStatus");
  });

  it("PMO (kurum geneli) tüm KPI×dönem satırlarını görür; workbook PK Buffer üretir", async () => {
    const seed = await seedReportingData(prisma);
    const pmoScope: UserScope = { id: seed.pmoId, role: "PMO", departmentId: null };

    const rows = await rowsFor(pmoScope);
    // 2026 RED dönem + 2025 GREEN dönem = 2 satır
    expect(rows.length).toBe(2);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(["GREEN", "RED"]);

    const buf = buildWorkbook(report.toWorkbook(await report.fetch(ctx(pmoScope)), ctx(pmoScope)));
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const wb = xlsx.read(buf, { type: "buffer" });
    expect(xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toHaveLength(2);
  });

  it("kapsam dışı departman başkanı hiçbir satır görmez (filtre genişletmez)", async () => {
    await seedReportingData(prisma); // kapsam-dışı veriyi doldur
    const otherDept = await prisma.department.create({ data: { name: "Pazarlama" } });
    const otherHead = await prisma.user.create({
      data: { name: "Diğer", email: "other@test.local", role: "DEPT_HEAD", departmentId: otherDept.id },
    });
    const scope: UserScope = { id: otherHead.id, role: "DEPT_HEAD", departmentId: otherDept.id };

    expect(await rowsFor(scope)).toHaveLength(0);
  });

  it("year filtresi yalnız o yılın dönemlerini döner", async () => {
    const seed = await seedReportingData(prisma);
    const pmoScope: UserScope = { id: seed.pmoId, role: "PMO", departmentId: null };

    const rows2025 = await rowsFor(pmoScope, { year: 2025 });
    expect(rows2025).toHaveLength(1);
    expect(rows2025[0].status).toBe("GREEN");
  });

  it("color filtresi yalnız o renkteki dönemleri döner", async () => {
    const seed = await seedReportingData(prisma);
    const pmoScope: UserScope = { id: seed.pmoId, role: "PMO", departmentId: null };

    const rowsRed = await rowsFor(pmoScope, { color: "RED" });
    expect(rowsRed).toHaveLength(1);
    expect(rowsRed[0].status).toBe("RED");
  });
});
