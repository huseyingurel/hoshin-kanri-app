/**
 * E-posta taşıma arabirimi (FR-28 dikiş yeri). Gerçek sağlayıcı (Resend/SMTP) ileride tek
 * dosyalık bir adaptör olarak eklenir. Bugün yalnız `LogTransport` uygulanır.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailResult {
  delivered: boolean;
  transport: string;
}

export interface EmailTransport {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailResult>;
}
