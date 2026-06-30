/**
 * İcra Kurulu Tek-Sayfa Özeti (FR-36). Mevcut /reports sayfasının sorgularını yansıtır:
 * RAG sayıları, Hoshin ilerlemesi, en kritik RED KPI'lar ve son açık kararlar.
 */

import { isOrgWideRole } from "@/lib/access";
import { reportScopeBundle } from "@/lib/dataScope";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface Data {
  green: number;
  amber: number;
  red: number;
  hoshinProgress: Array<{ name: string; progress: number }>;
  criticalKpis: Array<{ kpi: string; variance: number | null; cm: string }>;
  decisions: Array<{ decision: string; assignee: string; due: string }>;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const { kpiWhere, hoshinWhere } = reportScopeBundle(ctx.scope, ctx.filters);
  const orgWide = isOrgWideRole(ctx.scope.role);

  const kpis = await ctx.db.kPI.findMany({
    ...(kpiWhere ? { where: kpiWhere } : {}),
    include: {
      periodRecords: { orderBy: { periodStart: "desc" }, take: 1 },
      countermeasures: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  let green = 0,
    amber = 0,
    red = 0;
  const criticalKpis: Data["criticalKpis"] = [];
  for (const kpi of kpis) {
    const last = kpi.periodRecords[0];
    if (!last) continue;
    if (last.statusColor === "GREEN") green++;
    else if (last.statusColor === "AMBER") amber++;
    else if (last.statusColor === "RED") {
      red++;
      criticalKpis.push({
        kpi: kpi.name,
        variance: last.variance,
        cm: kpi.countermeasures[0]?.actionSummary ?? kpi.countermeasures[0]?.problemStatement ?? "(yok)",
      });
    }
  }

  const hoshins = await ctx.db.hoshin.findMany({
    ...(hoshinWhere ? { where: hoshinWhere } : {}),
    include: { majorTasks: { include: { actionPlans: true } } },
  });
  const hoshinProgress = hoshins.map((h) => {
    const actions = h.majorTasks.flatMap((mt) => mt.actionPlans);
    const total = actions.reduce((s, a) => s + a.progressPercent, 0);
    return { name: h.title, progress: actions.length ? Math.round(total / actions.length) : 0 };
  });

  const decWhere = orgWide
    ? { status: "OPEN" as const }
    : { status: "OPEN" as const, assigneeId: ctx.scope.id };
  const decisions = await ctx.db.decision.findMany({
    where: decWhere,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { assignee: true },
  });

  return {
    green,
    amber,
    red,
    hoshinProgress,
    criticalKpis: criticalKpis.slice(0, 5),
    decisions: decisions.map((d) => ({
      decision: d.decisionText,
      assignee: d.assignee?.name ?? "Atanmadı",
      due: fmtDate(d.dueDate),
    })),
  };
}

function toWorkbook(data: Data): WorkbookSpec {
  return {
    sheets: [
      { name: "RAG Özet", columns: ["Durum", "Adet"], rows: [
        { Durum: "GREEN", Adet: data.green },
        { Durum: "AMBER", Adet: data.amber },
        { Durum: "RED", Adet: data.red },
      ] },
      { name: "Hoshin İlerleme", columns: ["Hoshin", "İlerleme %"], rows: data.hoshinProgress.map((h) => ({ Hoshin: h.name, "İlerleme %": h.progress })) },
      { name: "Kritik KPI", columns: ["KPI", "Sapma", "Karşı Önlem"], rows: data.criticalKpis.map((k) => ({ KPI: k.kpi, Sapma: k.variance, "Karşı Önlem": k.cm })) },
      { name: "Açık Kararlar", columns: ["Karar", "Sorumlu", "Vade"], rows: data.decisions.map((d) => ({ Karar: d.decision, Sorumlu: d.assignee, Vade: d.due })) },
    ],
  };
}

function toPdf(data: Data, ctx: ReportContext): PdfSpec {
  const meta = ctx.filters.year != null ? [`Yıl: ${ctx.filters.year}`] : [];
  return {
    title: "İcra Kurulu Tek-Sayfa Özeti",
    meta,
    sections: [
      { heading: "RAG Durumu", paragraphs: [`GREEN: ${data.green}   AMBER: ${data.amber}   RED: ${data.red}`] },
      { heading: "Hoshin İlerlemesi", table: { columns: ["Hoshin", "İlerleme"], rows: data.hoshinProgress.map((h) => [h.name, `%${h.progress}`]) } },
      { heading: "Kritik KPI'lar", table: { columns: ["KPI", "Sapma", "Karşı Önlem"], rows: data.criticalKpis.map((k) => [k.kpi, k.variance, k.cm]) } },
      { heading: "Açık Kararlar", table: { columns: ["Karar", "Sorumlu", "Vade"], rows: data.decisions.map((d) => [d.decision, d.assignee, d.due]) } },
    ],
  };
}

registerReport<Data>({ key: "executiveOnePager", title: "İcra Kurulu Tek-Sayfa Özeti", fetch: fetchData, toWorkbook, toPdf });
