import { describe, expect, it } from "vitest";
import {
  SUSTAINED_OVERDUE_DAYS,
  computeEscalationLevel,
  escalationRecipients,
} from "@/lib/engine/escalation";

describe("computeEscalationLevel", () => {
  it("gecikme yok, RED yok → 0", () => {
    expect(computeEscalationLevel({ daysOverdue: 0, consecutiveRed: 0 })).toBe(0);
    expect(computeEscalationLevel({ daysOverdue: -3, consecutiveRed: 1 })).toBe(0);
  });

  it("kısa gecikme → 1", () => {
    expect(computeEscalationLevel({ daysOverdue: 1, consecutiveRed: 0 })).toBe(1);
    expect(computeEscalationLevel({ daysOverdue: SUSTAINED_OVERDUE_DAYS - 1, consecutiveRed: 0 })).toBe(1);
  });

  it("uzun süreli gecikme → 2", () => {
    expect(computeEscalationLevel({ daysOverdue: SUSTAINED_OVERDUE_DAYS, consecutiveRed: 0 })).toBe(2);
    expect(computeEscalationLevel({ daysOverdue: 60, consecutiveRed: 0 })).toBe(2);
  });

  it("2 ardışık RED → 2 (gecikmeden bağımsız)", () => {
    expect(computeEscalationLevel({ daysOverdue: 0, consecutiveRed: 2 })).toBe(2);
    expect(computeEscalationLevel({ daysOverdue: 0, consecutiveRed: 5 })).toBe(2);
  });

  it("1 RED tek başına eskalasyon değil", () => {
    expect(computeEscalationLevel({ daysOverdue: 0, consecutiveRed: 1 })).toBe(0);
  });
});

describe("escalationRecipients", () => {
  const manager = { id: "u-manager" };
  const sponsor = { id: "u-sponsor" };
  const pmo = { id: "u-pmo" };

  it("seviye 0 → kimse", () => {
    expect(escalationRecipients(0, manager, sponsor, pmo)).toEqual([]);
  });

  it("seviye 1 → yönetici", () => {
    expect(escalationRecipients(1, manager, sponsor, pmo)).toEqual([manager]);
  });

  it("seviye 2 → sponsor + PMO", () => {
    expect(escalationRecipients(2, manager, sponsor, pmo)).toEqual([sponsor, pmo]);
  });

  it("null hedefler elenir", () => {
    expect(escalationRecipients(1, null, sponsor, pmo)).toEqual([]);
    expect(escalationRecipients(2, manager, null, pmo)).toEqual([pmo]);
  });

  it("aynı kişi (örn. sponsor == PMO) tekilleştirilir", () => {
    const same = { id: "u-both" };
    expect(escalationRecipients(2, manager, same, same)).toEqual([same]);
  });
});
