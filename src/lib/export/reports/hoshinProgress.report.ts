/**
 * Hoshin İlerleme raporu (FR-36). Kapsamlı Hoshin'ler ve ortalama aksiyon planı ilerlemesi.
 * Yıl filtresi (FR-42 arşiv) reportScopeBundle.hoshinWhere ile uygulanır.
 */

import { reportScopeBundle } from "@/lib/dataScope";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface Row {
  hoshin: string;
  year: number;
  type: string;
  status: string;
  actionCount: number;
  progress: number;
}
interface Data {
  rows: Row[];
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const { hoshinWhere } = reportScopeBundle(ctx.scope, ctx.filters);
  const hoshins = await ctx.db.hoshin.findMany({
    ...(hoshinWhere ? { where: hoshinWhere } : {}),
    include: { majorTasks: { include: { actionPlans: true } } },
    orderBy: [{ year: "desc" }, { title: "asc" }],
  });
  const rows: Row[] = hoshins.map((h) => {
    const actions = h.majorTasks.flatMap((mt) => mt.actionPlans);
    const total = actions.reduce((s, a) => s + a.progressPercent, 0);
    const progress = actions.length > 0 ? Math.round(total / actions.length) : 0;
    return {
      hoshin: h.title,
      year: h.year,
      type: h.type,
      status: h.status,
      actionCount: actions.length,
      progress,
    };
  });
  return { rows };
}

const COLUMNS = ["Hoshin", "Yıl", "Tür", "Durum", "Aksiyon Sayısı", "İlerleme %"];

function toWorkbook(data: Data): WorkbookSpec {
  return {
    sheets: [
      {
        name: "Hoshin İlerleme",
        columns: COLUMNS,
        rows: data.rows.map((r) => ({
          Hoshin: r.hoshin,
          Yıl: r.year,
          Tür: r.type,
          Durum: r.status,
          "Aksiyon Sayısı": r.actionCount,
          "İlerleme %": r.progress,
        })),
      },
    ],
  };
}

function toPdf(data: Data, ctx: ReportContext): PdfSpec {
  const meta = ctx.filters.year != null ? [`Yıl: ${ctx.filters.year}`] : [];
  return {
    title: "Hoshin İlerleme Raporu",
    meta,
    sections: [
      {
        table: {
          columns: COLUMNS,
          rows: data.rows.map((r) => [r.hoshin, r.year, r.type, r.status, r.actionCount, `%${r.progress}`]),
        },
      },
    ],
  };
}

registerReport<Data>({ key: "hoshinProgress", title: "Hoshin İlerleme Raporu", fetch: fetchData, toWorkbook, toPdf });
