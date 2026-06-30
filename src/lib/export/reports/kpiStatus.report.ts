/**
 * KPI Durum raporu (FR-46 Excel + FR-36 standart rapor). Kapsamlı KPI'lar × dönem kayıtları;
 * her satır bir dönem ölçümüdür (Hoshin→MajorTask→ActionPlan→KPI zinciri ile).
 *
 * Filtreler: dept (kpiWhere'e AND'lenir), year (dönem başlangıç yılına göre süzülür),
 * color (son/satır statusColor'a göre veri düzeyinde süzülür). Hiçbir filtre kapsamı genişletmez.
 */

import { reportScopeBundle } from "@/lib/dataScope";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface KpiRow {
  hoshin: string;
  majorTask: string;
  actionPlan: string;
  kpi: string;
  unit: string;
  target: number | null;
  period: string;
  actual: number | null;
  variance: number | null;
  status: string;
  comment: string;
}

interface KpiStatusData {
  rows: KpiRow[];
}

const COLUMNS = [
  "Hoshin",
  "Ana Hedef",
  "Aksiyon Planı",
  "KPI",
  "Birim",
  "Hedef",
  "Dönem",
  "Gerçekleşen",
  "Sapma",
  "Durum",
  "Açıklama",
];

function periodLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const s = fmt(start);
  const e = fmt(end);
  return s === e ? s : `${s}→${e}`;
}

async function fetchData(ctx: ReportContext): Promise<KpiStatusData> {
  const { kpiWhere } = reportScopeBundle(ctx.scope, ctx.filters);
  const { year, color } = ctx.filters;

  const kpis = await ctx.db.kPI.findMany({
    ...(kpiWhere ? { where: kpiWhere } : {}),
    include: {
      actionPlan: { include: { majorTask: { include: { hoshin: true } } } },
      periodRecords: { orderBy: { periodStart: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const rows: KpiRow[] = [];
  for (const kpi of kpis) {
    const ap = kpi.actionPlan;
    const mt = ap?.majorTask;
    const hoshin = mt?.hoshin;
    for (const rec of kpi.periodRecords) {
      if (year != null && rec.periodStart.getUTCFullYear() !== year) continue;
      if (color != null && rec.statusColor !== color) continue;
      rows.push({
        hoshin: hoshin?.title ?? "-",
        majorTask: mt?.title ?? "-",
        actionPlan: ap?.title ?? "-",
        kpi: kpi.name,
        unit: kpi.unit,
        target: rec.targetValue,
        period: periodLabel(rec.periodStart, rec.periodEnd),
        actual: rec.actualValue,
        variance: rec.variance,
        status: rec.statusColor ?? "-",
        comment: rec.varianceReason ?? rec.ownerComment ?? "",
      });
    }
  }
  return { rows };
}

function toWorkbook(data: KpiStatusData): WorkbookSpec {
  return {
    sheets: [
      {
        name: "KPI Durum",
        columns: COLUMNS,
        rows: data.rows.map((r) => ({
          Hoshin: r.hoshin,
          "Ana Hedef": r.majorTask,
          "Aksiyon Planı": r.actionPlan,
          KPI: r.kpi,
          Birim: r.unit,
          Hedef: r.target,
          Dönem: r.period,
          Gerçekleşen: r.actual,
          Sapma: r.variance,
          Durum: r.status,
          Açıklama: r.comment,
        })),
      },
    ],
  };
}

function toPdf(data: KpiStatusData, ctx: ReportContext): PdfSpec {
  const meta: string[] = [];
  if (ctx.filters.year != null) meta.push(`Yıl: ${ctx.filters.year}`);
  if (ctx.filters.color) meta.push(`Renk: ${ctx.filters.color}`);
  return {
    title: "KPI Durum Raporu",
    meta,
    sections: [
      {
        table: {
          columns: ["KPI", "Birim", "Hedef", "Dönem", "Gerçek.", "Sapma", "Durum"],
          rows: data.rows.map((r) => [r.kpi, r.unit, r.target, r.period, r.actual, r.variance, r.status]),
        },
      },
    ],
  };
}

registerReport<KpiStatusData>({
  key: "kpiStatus",
  title: "KPI Durum Raporu",
  fetch: fetchData,
  toWorkbook,
  toPdf,
});
