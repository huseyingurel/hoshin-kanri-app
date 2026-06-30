/**
 * Yapılandırılmış (tek-satır JSON) loglama. Harici bağımlılık yok — bugün de bir logger
 * kullanılmıyor. Çıktı greplenebilir ve testlerde `vi.spyOn(console, ...)` ile doğrulanır.
 *
 * Önemli: loglama hiçbir zaman iş mantığını bozmamalıdır. `logEvent` bir `$transaction`
 * içinde çağrılabildiğinden (ör. `recordAudit`), serileştirme hatası fırlatıp işlemi geri
 * almamalı; bu yüzden tüm gövde fırlatmaya karşı korunur.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

/** BigInt, Error ve döngüsel referansları güvenle serileştiren JSON replacer. */
function makeSafeReplacer() {
  const seen = new WeakSet<object>();
  return function replacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

/**
 * Tek bir JSON satırını stdout/stderr'e yazar.
 * `error` seviyesi `console.error`, diğerleri `console.log` kullanır.
 * Standart alanlar (ts/level/event) çağrı alanları tarafından ezilemez.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const ts = new Date().toISOString();
  let line: string;
  try {
    // fields önce yazılır, kanonik alanlar (ts/level/event) en sonda → her zaman kazanır.
    line = JSON.stringify({ ...fields, ts, level, event }, makeSafeReplacer());
  } catch {
    // Beklenmedik serileştirme hatası: minimum, her zaman geçerli bir satıra geri dön.
    line = JSON.stringify({ ts, level, event, logError: "fields-not-serializable" });
  }
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
