import { vi } from "vitest";

/**
 * `logEvent` çıktısını (tek-satır JSON) yakalar. console.log/error'ı geçici olarak susturur,
 * satırları ayrıştırır ve olay adına göre filtrelemeyi kolaylaştırır.
 */
export interface LogCapture {
  /** Şimdiye dek yakalanan tüm ayrıştırılmış JSON kayıtları. */
  events: () => Array<Record<string, unknown>>;
  /** Belirli bir `event` adına sahip kayıtlar. */
  byEvent: (name: string) => Array<Record<string, unknown>>;
  restore: () => void;
}

export function captureLogEvents(): LogCapture {
  const lines: string[] = [];
  const sink = (line: unknown) => {
    if (typeof line === "string") lines.push(line);
  };
  const logSpy = vi.spyOn(console, "log").mockImplementation(sink);
  const errSpy = vi.spyOn(console, "error").mockImplementation(sink);

  const parse = (): Array<Record<string, unknown>> => {
    const out: Array<Record<string, unknown>> = [];
    for (const l of lines) {
      try {
        out.push(JSON.parse(l) as Record<string, unknown>);
      } catch {
        // JSON olmayan satırları yok say (yalnız logEvent çıktısıyla ilgileniyoruz).
      }
    }
    return out;
  };

  return {
    events: parse,
    byEvent: (name) => parse().filter((e) => e.event === name),
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}
