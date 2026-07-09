/**
 * Unit tests for the Collections adapter's non-trivial logic — field mapping, scope/dedup
 * refinement, the not-found-vs-real-error distinction, the create-id guard, and pagination
 * termination. Network is mocked at `fetch`; these assert the behaviour the live spike proved
 * and pin the fixes from the 2026-07-09 review.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";

type Body = Record<string, unknown>;

function res(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

/** Route mocked RPCs by method name (the last path segment) + parsed body. */
function mockRpc(handler: (method: string, body: Body) => Response) {
  const fn = vi.fn(async (url: string, init: { body: string }) => {
    const method = url.split("/").pop() as string;
    return handler(method, JSON.parse(init.body) as Body);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("field mapping", () => {
  it("getUserById maps prefixed columns to the domain shape", async () => {
    mockRpc((m) =>
      m === "GetRecordById"
        ? res(200, {
            id: "u1",
            data: { usr_role: "PMO", usr_departmentId: "d1", usr_email: "a@b.c" },
          })
        : res(404, {}),
    );
    expect(await db.getUserById("u1")).toEqual({
      id: "u1",
      role: "PMO",
      departmentId: "d1",
      email: "a@b.c",
    });
  });

  it("getRagThresholds reads settings and defaults the missing one", async () => {
    mockRpc((m) =>
      m === "ListRecords"
        ? res(200, {
            total: 1,
            items: [{ id: "s1", data: { sset_key: "RAG_RED_THRESHOLD", sset_value: "-12" } }],
          })
        : res(404, {}),
    );
    // red comes from the setting; amber falls back to the -5 default.
    expect(await db.getRagThresholds()).toEqual({ redThreshold: -12, amberThreshold: -5 });
  });
});

describe("scope predicate (findKpiInScope)", () => {
  const kpiRec = (over: Body = {}) =>
    res(200, {
      id: "k1",
      data: { kpi_name: "X", kpi_ownerUserId: "o1", kpi_responsibleDeptId: "dep1", ...over },
    });

  it("allows the owner", async () => {
    mockRpc(() => kpiRec());
    expect(await db.findKpiInScope("k1", { ownerUserId: "o1", departmentId: null })).not.toBeNull();
  });

  it("allows a same-department user", async () => {
    mockRpc(() => kpiRec());
    expect(
      await db.findKpiInScope("k1", { ownerUserId: "other", departmentId: "dep1" }),
    ).not.toBeNull();
  });

  it("denies an out-of-scope user", async () => {
    mockRpc(() => kpiRec());
    expect(
      await db.findKpiInScope("k1", { ownerUserId: "other", departmentId: "depX" }),
    ).toBeNull();
  });

  it("null scope (org-wide role) is always allowed", async () => {
    mockRpc(() => kpiRec());
    expect(await db.findKpiInScope("k1", null)).not.toBeNull();
  });
});

describe("dedup refinement (findOpenCountermeasure)", () => {
  it("ignores substring false-positives and CLOSED rows", async () => {
    mockRpc((m) =>
      m === "SearchRecords"
        ? res(200, {
            total: 3,
            items: [
              { id: "c1", data: { cm_kpiId: "k1extra", cm_status: "OPEN" } }, // substring hit
              { id: "c2", data: { cm_kpiId: "k1", cm_status: "CLOSED" } },
              { id: "c3", data: { cm_kpiId: "k1", cm_status: "OPEN" } },
            ],
          })
        : res(404, {}),
    );
    expect(await db.findOpenCountermeasure("k1")).toEqual({ id: "c3" });
  });

  it("returns null when only a substring match exists", async () => {
    mockRpc((m) =>
      m === "SearchRecords"
        ? res(200, { total: 1, items: [{ id: "c1", data: { cm_kpiId: "k10", cm_status: "OPEN" } }] })
        : res(404, {}),
    );
    expect(await db.findOpenCountermeasure("k1")).toBeNull();
  });
});

describe("error handling", () => {
  it("treats a not-found 500 as 'no record'", async () => {
    mockRpc(() => res(500, { error: "Record not found or already deleted" }));
    expect(await db.getKpiById("nope")).toBeNull();
  });

  it("propagates a real (non-not-found) 500 instead of masking it as not-found", async () => {
    mockRpc(() => res(500, { error: "Internal server error" }));
    await expect(db.getKpiById("k1")).rejects.toThrow();
  });

  it("createRecord throws when the response carries no record id (silent bad-write guard)", async () => {
    mockRpc((m) => (m === "CreateRecord" ? res(200, {}) : res(404, {})));
    await expect(
      db.createPeriodRecord({
        kpiId: "k1",
        periodStart: new Date("2026-05-01T00:00:00Z"),
        periodEnd: new Date("2026-05-31T00:00:00Z"),
        targetValue: 1,
        actualValue: 1,
        variance: 0,
        statusColor: "GREEN",
        ownerComment: "",
        varianceReason: null,
        evidenceUrl: null,
        submittedById: "u1",
      }),
    ).rejects.toThrow();
  });
});

describe("pagination", () => {
  it("terminates (does not loop) when the backend ignores offset", async () => {
    // Same full page returned regardless of offset, with no `total` reported.
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `p${i}`,
      data: {
        kpr_kpiId: "k1",
        kpr_periodStart: new Date(Date.UTC(2020, i % 12, 1)).toISOString(),
        kpr_statusColor: "RED",
      },
    }));
    const fn = mockRpc((m) => (m === "SearchRecords" ? res(200, { items }) : res(404, {})));

    const out = await db.listPeriodRecords("k1");
    expect(out).toHaveLength(100);
    // page 0 (100 new) → page 1 (0 new ids) → stop. Never infinite.
    expect(fn.mock.calls.length).toBe(2);
  });

  it("stops after a short (final) page", async () => {
    const fn = mockRpc((m) =>
      m === "SearchRecords"
        ? res(200, { items: [{ id: "p1", data: { kpr_kpiId: "k1", kpr_periodStart: "2026-05-01T00:00:00Z", kpr_statusColor: "RED" } }] })
        : res(404, {}),
    );
    const out = await db.listPeriodRecords("k1");
    expect(out).toHaveLength(1);
    expect(fn.mock.calls.length).toBe(1);
  });
});
