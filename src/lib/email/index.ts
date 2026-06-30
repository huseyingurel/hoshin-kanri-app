/**
 * E-posta dikiş yeri girişi (FR-28). `getTransport` env ile seçilir; yanlış yapılandırma
 * **sessizce no-op olmaz** — `email.misconfigured` loglar ve fırlatır. `deliverEmail` bunu
 * yakalar, böylece in-app bildirim her zaman korunur (gönderim commit SONRASI denenir).
 *
 * INV-10: bir gönderim ya başarılır (`email.sent`) ya da izlenir (`email.failed` /
 * `email.misconfigured`) — asla izsiz düşmez.
 */

import { logEvent } from "@/lib/log";
import type { NotificationType } from "@/lib/domainTypes";
import { LogTransport } from "./logTransport";
import { renderEmail, type EmailContext } from "./templates";
import type { EmailResult, EmailTransport } from "./transport";

export function getTransport(): EmailTransport {
  const kind = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase();
  if (kind === "log") return new LogTransport();
  // resend/smtp henüz yok — açık hata (sessiz no-op değil).
  logEvent("error", "email.misconfigured", { transport: kind });
  throw new Error(`E-posta taşıyıcısı yapılandırılmadı: ${kind}`);
}

export interface DeliverEmailInput {
  to: string | null | undefined;
  type: NotificationType;
  ctx: EmailContext;
}

/**
 * Bir bildirimi e-posta olarak gönderir (commit sonrası çağrılır). Alıcı yoksa atlar;
 * yanlış yapılandırma/gönderim hatası loglanır ama çağıranı (ve in-app satırını) bozmaz.
 */
export async function deliverEmail(input: DeliverEmailInput): Promise<EmailResult | null> {
  if (!input.to) {
    logEvent("warn", "email.skipped_no_recipient", { type: input.type });
    return null;
  }

  let transport: EmailTransport;
  try {
    transport = getTransport();
  } catch {
    // email.misconfigured zaten loglandı; in-app bildirim korunur.
    return null;
  }

  let rendered;
  try {
    rendered = renderEmail(input.type, input.ctx);
  } catch (e) {
    logEvent("error", "email.failed", {
      to: input.to,
      type: input.type,
      message: e instanceof Error ? e.message : String(e),
    });
    return { delivered: false, transport: transport.name };
  }

  try {
    const res = await transport.send({ to: input.to, ...rendered });
    logEvent("info", "email.sent", { to: input.to, type: input.type, transport: transport.name });
    return res;
  } catch (e) {
    logEvent("error", "email.failed", {
      to: input.to,
      type: input.type,
      transport: transport.name,
      message: e instanceof Error ? e.message : String(e),
    });
    return { delivered: false, transport: transport.name };
  }
}
