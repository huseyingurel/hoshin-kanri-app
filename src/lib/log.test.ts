import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logEvent", () => {
  it("tek satırlık, ayrıştırılabilir JSON üretir (ts/level/event/alanlar)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "task.created", { taskId: "t1", periodKey: "2026-M05" });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("task.created");
    expect(parsed.taskId).toBe("t1");
    expect(parsed.periodKey).toBe("2026-M05");
    expect(typeof parsed.ts).toBe("string");
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
  });

  it("alan verilmediğinde de geçerli JSON yazar", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "sweep.started");
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("sweep.started");
  });

  it("error seviyesi console.error'a yönlenir, console.log'a değil", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "cron.misconfigured", { reason: "no secret" });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("cron.misconfigured");
  });

  it("kanonik alanlar (level/event) çağrı alanları tarafından ezilemez", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Kötü niyetli/kazara çakışan alanlar
    logEvent("info", "real.event", { event: "fake", level: "error", ts: "fake-ts" } as never);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("real.event");
    expect(parsed.level).toBe("info");
    expect(parsed.ts).not.toBe("fake-ts");
  });

  it("Error nesnesini message/stack ile serileştirir (boş {} değil)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "sweep.item_failed", { error: new Error("patladı") });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.error.message).toBe("patladı");
    expect(parsed.error.name).toBe("Error");
  });

  it("BigInt ve döngüsel referanslar fırlatmaz, geçerli JSON üretir", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() =>
      logEvent("info", "weird.fields", { big: BigInt(10), circular }),
    ).not.toThrow();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("weird.fields");
    expect(parsed.big).toBe("10");
    expect(parsed.circular.self).toBe("[Circular]");
  });
});
