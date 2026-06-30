/**
 * RED KPI + Karşı Önlemler raporu (FR-36). Son dönem kaydı RED olan kapsamlı KPI'lar ve
 * onlara bağlı açık karşı önlemler. Dept filtresi kpiWhere ile uygulanır.
 */

import { reportScopeBundle } from "@/lib/dataScope";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface Row {
  kpi: string;
  unit: string;
  lastActual: number | null;
  lastTarget: number | null;
  variance: number | null;
  problem: string;
  action: string;
  owner: string;
  cmStatus: string;
}
interface Data {
  rows: Row[];
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const { kpiWhere } = reportScopeBundle(ctx.scope, ctx.filters);
  const kpis = await ctx.db.kPI.findMany({
    ...(kpiWhere ? { where: kpiWhere } : {}),
    include: {
      periodRecords: { orderBy: { periodStart: "desc" }, take: 1 },
      countermeasures: { where: { status: "OPEN" }, include: { ownerUser: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  const rows: Row[] = [];
  for (const kpi of kpis) {
    const last = kpi.periodRecords[0];
    if (!last || last.statusColor !== "RED") continue;
    if (kpi.countermeasures.length === 0) {
      rows.push({
        kpi: kpi.name,
        unit: kpi.unit,
        lastActual: last.actualValue,
        lastTarget: last.targetValue,
        variance: last.variance,
        problem: "(açık karşı önlem yok)",
        action: "-",
        owner: "-",
        cmStatus: "-",
      });
      continue;
    }
    for (const cm of kpi.countermeasures) {
      rows.push({
        kpi: kpi.name,
        unit: kpi.unit,
        lastActual: last.actualValue,
        lastTarget: last.targetValue,
        variance: last.variance,
        problem: cm.problemStatement,
        action: cm.actionSummary ?? "-",
        owner: cm.ownerUser?.name ?? "Atanmadı",
        cmStatus: cm.status,
      });
    }
  }
  return { rows };
}

const COLUMNS = ["KPI", "Birim", "Gerçekleşen", "Hedef", "Sapma", "Problem", "Aksiyon", "Sorumlu", "Durum"];

function toWorkbook(data: Data): WorkbookSpec {
  return {
    sheets: [
      {
        name: "RED KPI Karşı Önlem",
        columns: COLUMNS,
        rows: data.rows.map((r) => ({
          KPI: r.kpi,
          Birim: r.unit,
          Gerçekleşen: r.lastActual,
          Hedef: r.lastTarget,
          Sapma: r.variance,
          Problem: r.problem,
          Aksiyon: r.action,
          Sorumlu: r.owner,
          Durum: r.cmStatus,
        })),
      },
    ],
  };
}

function toPdf(data: Data): PdfSpec {
  return {
    title: "RED KPI ve Karşı Önlemler",
    sections: [
      {
        table: {
          columns: ["KPI", "Sapma", "Problem", "Aksiyon", "Sorumlu"],
          rows: data.rows.map((r) => [r.kpi, r.variance, r.problem, r.action, r.owner]),
        },
      },
    ],
  };
}

registerReport<Data>({
  key: "redKpiCountermeasures",
  title: "RED KPI ve Karşı Önlemler",
  fetch: fetchData,
  toWorkbook,
  toPdf,
});
