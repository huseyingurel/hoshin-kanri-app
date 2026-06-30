/**
 * Varsayılan e-posta taşıyıcısı: gerçek gönderim yapmaz, niyeti döndürür. `deliverEmail`
 * sarmalayıcısı her gönderimi `email.sent` ile loglar — gönderim asla izsiz düşmez (INV-10).
 */

import type { EmailMessage, EmailResult, EmailTransport } from "./transport";

export class LogTransport implements EmailTransport {
  readonly name = "log";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_msg: EmailMessage): Promise<EmailResult> {
    return { delivered: true, transport: this.name };
  }
}
