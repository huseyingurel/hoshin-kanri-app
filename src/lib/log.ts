/**
 * Yapılandırılmış (tek-satır JSON) loglama. Harici bağımlılık yok — bugün de bir logger
 * kullanılmıyor. Çıktı greplenebilir ve testlerde `vi.spyOn(console, ...)` ile doğrulanır.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

/**
 * Tek bir JSON satırını stdout/stderr'e yazar.
 * `error` seviyesi `console.error`, diğerleri `console.log` kullanır.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
