import { describe, expect, it } from "vitest";
import { buildDedupeKey } from "@/lib/engine/tasks";

describe("buildDedupeKey", () => {
  it("kararlı ve okunabilir biçim", () => {
    expect(buildDedupeKey("PERIOD_ENTRY", "KPI", "kpi1", "2026-M05")).toBe(
      "PERIOD_ENTRY:KPI:kpi1:2026-M05",
    );
  });

  it("periodKey yoksa boş bırakılır", () => {
    expect(buildDedupeKey("CATCHBALL_REVIEW", "HOSHIN", "h1")).toBe("CATCHBALL_REVIEW:HOSHIN:h1:");
    expect(buildDedupeKey("CATCHBALL_REVIEW", "HOSHIN", "h1", null)).toBe(
      "CATCHBALL_REVIEW:HOSHIN:h1:",
    );
  });

  it("tür/varlık/dönem farklıysa anahtar farklıdır (çakışma yok)", () => {
    const a = buildDedupeKey("RED_KPI_REVIEW", "KPI", "k1", "2026-M05");
    const b = buildDedupeKey("RED_KPI_REVIEW", "KPI", "k1", "2026-M06"); // farklı dönem
    const c = buildDedupeKey("CM_FOLLOWUP", "KPI", "k1", "2026-M05"); // farklı tür
    const d = buildDedupeKey("RED_KPI_REVIEW", "KPI", "k2", "2026-M05"); // farklı varlık
    const keys = new Set([a, b, c, d]);
    expect(keys.size).toBe(4);
  });

  it("aynı girdiler aynı anahtarı üretir (idempotans)", () => {
    expect(buildDedupeKey("DUE_SOON", "ACTION_PLAN", "ap1", "2026-Q2")).toBe(
      buildDedupeKey("DUE_SOON", "ACTION_PLAN", "ap1", "2026-Q2"),
    );
  });
});
