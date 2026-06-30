/**
 * Açık Kararlar raporu (FR-36). Kurum geneli roller tüm açık kararları görür; diğerleri
 * yalnız kendine atanmış açık kararları (mevcut reports sayfası kuralı ile aynı).
 */

import { isOrgWideRole } from "@/lib/access";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface Row {
  decision: string;
  review: string;
  assignee: string;
  kpi: string;
  due: string;
  status: string;
}
interface Data {
  rows: Row[];
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const orgWide = isOrgWideRole(ctx.scope.role);
  const where = orgWide
    ? { status: "OPEN" as const }
    : { status: "OPEN" as const, assigneeId: ctx.scope.id };
  const decisions = await ctx.db.decision.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { review: true, assignee: true, kpi: true },
  });
  const rows: Row[] = decisions.map((d) => ({
    decision: d.decisionText,
    review: d.review?.title ?? "-",
    assignee: d.assignee?.name ?? "Atanmadı",
    kpi: d.kpi?.name ?? "-",
    due: fmtDate(d.dueDate),
    status: d.status,
  }));
  return { rows };
}

const COLUMNS = ["Karar", "Toplantı", "Sorumlu", "KPI", "Vade", "Durum"];

function toWorkbook(data: Data): WorkbookSpec {
  return {
    sheets: [
      {
        name: "Açık Kararlar",
        columns: COLUMNS,
        rows: data.rows.map((r) => ({
          Karar: r.decision,
          Toplantı: r.review,
          Sorumlu: r.assignee,
          KPI: r.kpi,
          Vade: r.due,
          Durum: r.status,
        })),
      },
    ],
  };
}

function toPdf(data: Data): PdfSpec {
  return {
    title: "Açık Kararlar",
    sections: [
      { table: { columns: COLUMNS, rows: data.rows.map((r) => [r.decision, r.review, r.assignee, r.kpi, r.due, r.status]) } },
    ],
  };
}

registerReport<Data>({ key: "openDecisions", title: "Açık Kararlar", fetch: fetchData, toWorkbook, toPdf });
