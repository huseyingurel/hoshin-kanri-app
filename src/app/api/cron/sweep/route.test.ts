import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SweepSummary } from "@/lib/engine/sweep";

const sweepMock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/engine/sweep", () => ({ runDailySweep: sweepMock.run }));

import { POST } from "./route";

const okSummary: SweepSummary = {
  ranAt: "2026-06-30T00:00:00.000Z",
  scanned: 3,
  generated: 1,
  notified: 2,
  escalated: 0,
  skipped: 0,
  failures: [],
};

function req(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("https://app.local/api/cron/sweep", { method: "POST", headers });
}

describe("POST /api/cron/sweep", () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => {
    sweepMock.run.mockReset();
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("CRON_SECRET tanımsızsa kapalı başarısız olur (500), tarama çalışmaz", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(sweepMock.run).not.toHaveBeenCalled();
  });

  it("yanlış bearer → 401, tarama çalışmaz", async () => {
    const res = await POST(req("Bearer yanlis"));
    expect(res.status).toBe(401);
    expect(sweepMock.run).not.toHaveBeenCalled();
  });

  it("Authorization başlığı yoksa → 401", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(sweepMock.run).not.toHaveBeenCalled();
  });

  it("doğru bearer + hatasız tarama → 200 ve özet gövdesi", async () => {
    sweepMock.run.mockResolvedValue(okSummary);
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okSummary);
  });

  it("kısmi hata (failures dolu) → 500 ama özet yine döner (yutma yok, INV-7)", async () => {
    const withFailure: SweepSummary = {
      ...okSummary,
      failures: [{ entity: "KPI:abc", error: "boom" }],
    };
    sweepMock.run.mockResolvedValue(withFailure);
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(withFailure);
  });

  it("tarama fırlatırsa → 500 hata gövdesi", async () => {
    sweepMock.run.mockRejectedValue(new Error("db down"));
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });
});
