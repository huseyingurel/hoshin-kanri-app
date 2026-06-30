/**
 * Bildirim e-posta şablonları (FR-28). Her `NOTIFICATION_TYPES` üyesi için konu/metin/HTML
 * üretir. PURE: Prisma yok. Tanınmayan tür → fırlatır (boş e-posta basmaz).
 */

import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/domainTypes";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailContext {
  /** Bildirimin başlığı (in-app ile aynı). */
  title: string;
  /** Bildirim gövdesi/özeti. */
  body?: string | null;
  /** İlgili varlığa bağlantı (opsiyonel). */
  link?: string | null;
}

const SUBJECT_PREFIX: Record<NotificationType, string> = {
  PERIOD_OPENED: "Dönem açıldı",
  DUE_SOON: "Vade yaklaşıyor",
  OVERDUE: "Vadesi geçti",
  KPI_RED: "KPI kırmızıya düştü",
  STRATEGIC_ESCALATION: "Stratejik yükseltme",
  REVIEW_UPCOMING: "Yaklaşan değerlendirme",
  DECISION_ASSIGNED: "Size bir karar atandı",
  CM_OVERDUE: "Karşı önlem vadesi geçti",
  CATCHBALL_REQUEST: "Catchball talebi",
  CATCHBALL_APPROVED: "Catchball onaylandı",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail(type: NotificationType, ctx: EmailContext): RenderedEmail {
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Bilinmeyen bildirim türü: ${type}`);
  }
  const prefix = SUBJECT_PREFIX[type];
  const subject = `[Hoshin Kanri] ${prefix}: ${ctx.title}`;
  const bodyText = ctx.body ?? "";
  const linkText = ctx.link ? `\n\nBağlantı: ${ctx.link}` : "";
  const text = `${ctx.title}\n\n${bodyText}${linkText}`.trim();

  const linkHtml = ctx.link
    ? `<p><a href="${escapeHtml(ctx.link)}">Ayrıntıyı görüntüle</a></p>`
    : "";
  const html =
    `<div style="font-family:sans-serif">` +
    `<h2>${escapeHtml(ctx.title)}</h2>` +
    (bodyText ? `<p>${escapeHtml(bodyText)}</p>` : "") +
    linkHtml +
    `<hr/><p style="color:#888;font-size:12px">Hoshin Kanri otomatik bildirim</p>` +
    `</div>`;

  return { subject, text, html };
}
