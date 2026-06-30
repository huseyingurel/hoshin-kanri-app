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
});
