/**
 * Toplantı Tutanağı raporu (FR-34). `filters.reviewId` ile bir incelemeyi alır; kararları,
 * sorumlularını ve vade tarihlerini PDF/Excel tutanağı olarak üretir.
 *
 * `reviewId` verilmezse açık hata fırlatır (route → 500 + export.failed) — boş tutanak basmaz.
 */

import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import { registerReport, type ReportContext } from "@/lib/export/reports/registry";

interface DecisionRow {
  decision: string;
  assignee: string;
  due: string;
  status: string;
}
interface Data {
  title: string;
  date: string;
  type: string;
  organizer: string;
  chair: string;
  coordinator: string;
  frequency: string;
  decisions: DecisionRow[];
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

async function fetchData(ctx: ReportContext): Promise<Data> {
  const reviewId = ctx.filters.reviewId;
  if (!reviewId) {
    throw new Error("Toplantı tutanağı için reviewId gerekli");
  }
  const review = await ctx.db.review.findUnique({
    where: { id: reviewId },
    include: {
      organizer: true,
      decisions: { include: { assignee: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!review) {
    throw new Error(`İnceleme bulunamadı: ${reviewId}`);
  }

  // chair/coordinator kullanıcı adlarını çöz (opsiyonel alanlar).
  const userIds = [review.chairUserId, review.coordinatorUserId].filter(Boolean) as string[];
  const users = userIds.length
    ? await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? "-";

  return {
    title: review.title,
    date: fmtDate(review.date),
    type: review.type,
    organizer: review.organizer?.name ?? "-",
    chair: nameOf(review.chairUserId),
    coordinator: nameOf(review.coordinatorUserId),
    frequency: review.frequency ?? "-",
    decisions: review.decisions.map((d) => ({
      decision: d.decisionText,
      assignee: d.assignee?.name ?? "Atanmadı",
      due: fmtDate(d.dueDate),
      status: d.status,
    })),
  };
}

const COLUMNS = ["Karar", "Sorumlu", "Vade", "Durum"];

function toWorkbook(data: Data): WorkbookSpec {
  return {
    sheets: [
      {
        name: "Tutanak",
        columns: COLUMNS,
        rows: data.decisions.map((d) => ({ Karar: d.decision, Sorumlu: d.assignee, Vade: d.due, Durum: d.status })),
      },
    ],
  };
}

function toPdf(data: Data): PdfSpec {
  return {
    title: `Toplantı Tutanağı — ${data.title}`,
    subtitle: `${data.type} • ${data.date}`,
    meta: [`Başkan: ${data.chair}`, `Koordinatör: ${data.coordinator}`, `Düzenleyen: ${data.organizer}`, `Sıklık: ${data.frequency}`],
    sections: [
      {
        heading: "Kararlar",
        table: { columns: COLUMNS, rows: data.decisions.map((d) => [d.decision, d.assignee, d.due, d.status]) },
      },
    ],
  };
}

registerReport<Data>({ key: "meetingMinutes", title: "Toplantı Tutanağı", fetch: fetchData, toWorkbook, toPdf });
