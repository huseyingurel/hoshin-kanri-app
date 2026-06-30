/**
 * Bowling Chart matris raporu (FR-20). KPI'lar satır, dönemler sütun; hücre = gerçekleşen
 * değer (durum metni ile). Ekrandaki renkli ızgaranın sunucu-tarafı (ekran görüntüsü değil)
 * PDF/Excel karşılığı.
 */

import { reportScopeBundle } from "@/lib/dataScope";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface Cell {
  actual: number | null;
  status: string;
}
interface KpiRow {
  kpi: string;
  unit: string;
  cells: Record<string, Cell>;
}
interface Data {
  periods: string[];
  rows: KpiRow[];
}

function periodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const { kpiWhere } = reportScopeBundle(ctx.scope, ctx.filters);
  const { year } = ctx.filters;
  const kpis = await ctx.db.kPI.findMany({
    ...(kpiWhere ? { where: kpiWhere } : {}),
    include: { periodRecords: { orderBy: { periodStart: "asc" } } },
    orderBy: { name: "asc" },
  });

  const periodSet = new Set<string>();
  const rows: KpiRow[] = kpis.map((kpi) => {
    const cells: Record<string, Cell> = {};
    for (const rec of kpi.periodRecords) {
      if (year != null && rec.periodStart.getUTCFullYear() !== year) continue;
      const key = periodKey(rec.periodStart);
      periodSet.add(key);
      cells[key] = { actual: rec.actualValue, status: rec.statusColor ?? "-" };
    }
    return { kpi: kpi.name, unit: kpi.unit, cells };
  });

  return { periods: Array.from(periodSet).sort(), rows };
}

function cellText(c: Cell | undefined): string {
  if (!c) return "·";
  const v = c.actual ?? "-";
  return `${v} (${c.status})`;
}

function toWorkbook(data: Data): WorkbookSpec {
  const columns = ["KPI", "Birim", ...data.periods];
  return {
    sheets: [
      {
        name: "Bowling",
        columns,
        rows: data.rows.map((r) => {
          const row: Record<string, string | number | null> = { KPI: r.kpi, Birim: r.unit };
          for (const p of data.periods) row[p] = r.cells[p] ? `${r.cells[p].actual ?? "-"} (${r.cells[p].status})` : "";
          return row;
        }),
      },
    ],
  };
}

function toPdf(data: Data, ctx: ReportContext): PdfSpec {
  const meta = ctx.filters.year != null ? [`Yıl: ${ctx.filters.year}`] : [];
  return {
    title: "Bowling Chart (KPI × Dönem)",
    meta,
    sections: [
      {
        table: {
          columns: ["KPI", ...data.periods],
          rows: data.rows.map((r) => [r.kpi, ...data.periods.map((p) => cellText(r.cells[p]))]),
        },
      },
    ],
  };
}

registerReport<Data>({ key: "bowling", title: "Bowling Chart", fetch: fetchData, toWorkbook, toPdf });
