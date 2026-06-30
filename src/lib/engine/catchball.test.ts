import { describe, expect, it } from "vitest";
import { CATCHBALL_STATUSES, type CatchballStatus } from "@/lib/domainTypes";
import {
  TRANSITIONS,
  canActivate,
  canTransition,
  isCatchballStatus,
  nextStatuses,
} from "@/lib/engine/catchball";

describe("canTransition", () => {
  it("izinli geçişler", () => {
    expect(canTransition("DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_REVIEW", "AGREED")).toBe(true);
    expect(canTransition("AGREED", "APPROVED")).toBe(true);
    expect(canTransition("REJECTED", "DRAFT")).toBe(true);
  });

  it("yasak geçişler", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("APPROVED", "IN_REVIEW")).toBe(false); // terminal
    expect(canTransition("IN_REVIEW", "DRAFT")).toBe(false);
    expect(canTransition("DRAFT", "DRAFT")).toBe(false); // kendine geçiş yok
  });

  it("bilinmeyen `from` güvenle false döner", () => {
    expect(canTransition("BOGUS", "IN_REVIEW")).toBe(false);
    expect(canTransition("", "DRAFT")).toBe(false);
  });
});

describe("TRANSITIONS matrisi", () => {
  it("her durum tanımlı ve yalnız geçerli hedeflere işaret eder", () => {
    for (const status of CATCHBALL_STATUSES) {
      const targets = TRANSITIONS[status];
      expect(Array.isArray(targets)).toBe(true);
      for (const t of targets) {
        expect(CATCHBALL_STATUSES).toContain(t);
      }
    }
  });

  it("APPROVED, DRAFT'tan çok adımlı yolla erişilebilir", () => {
    // DRAFT → IN_REVIEW → AGREED → APPROVED
    const path: CatchballStatus[] = ["DRAFT", "IN_REVIEW", "AGREED", "APPROVED"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
});

describe("nextStatuses / isCatchballStatus / canActivate", () => {
  it("nextStatuses geçerli/geçersiz", () => {
    expect(nextStatuses("IN_REVIEW")).toEqual(["REVISED", "AGREED", "REJECTED"]);
    expect(nextStatuses("APPROVED")).toEqual([]);
    expect(nextStatuses("BOGUS")).toEqual([]);
  });

  it("isCatchballStatus", () => {
    expect(isCatchballStatus("APPROVED")).toBe(true);
    expect(isCatchballStatus("bogus")).toBe(false);
  });

  it("canActivate yalnız APPROVED için doğru (INV-5)", () => {
    expect(canActivate("APPROVED")).toBe(true);
    expect(canActivate("AGREED")).toBe(false);
    expect(canActivate("DRAFT")).toBe(false);
  });
});
