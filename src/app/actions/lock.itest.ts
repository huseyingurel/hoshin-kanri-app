import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { lockPeriod, reopenPeriod, saveKpiRecord } from "@/app/actions/kpiActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

const MAY = new Date(Date.UTC(2026, 4, 15));

/** Bir dönem kaydı oluşturup kimliğini döner (sahip, GREEN). */
async function seedRecord(kpiId: string, ownerId: string): Promise<string> {
  h.userId = ownerId;
  const res = await saveKpiRecord(kpiId, 100, 100, MAY, "");
  expect(res).toEqual({ success: true });
  const rec = await prisma.kPIPeriodRecord.findFirstOrThrow({ where: { kpiId } });
  return rec.id;
}

describe("lockPeriod / reopenPeriod (entegrasyon, INV-6)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    h.userId = null;
    log?.restore();
    log = null;
  });

  it("PMO kilitler: locked=true, LOCK denetimi, period.locked logu", async () => {
    const seed = await seedGovernance(prisma);
    const recordId = await seedRecord(seed.kpiId, seed.ownerId);

    log = captureLogEvents();
    h.userId = seed.pmoId;
    const res = await lockPeriod(recordId);
    expect(res).toEqual({ success: true });

    const rec = await prisma.kPIPeriodRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(rec.locked).toBe(true);
    expect(rec.lockedById).toBe(seed.pmoId);
    expect(rec.lockedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "LOCK" } });
    expect(audit).toMatchObject({ entityType: "KPIPeriodRecord", entityId: recordId });
    expect(log.byEvent("period.locked")).toHaveLength(1);
  });

  it("kilitli dönemde sahip yeni kayıt giremez (yetkisiz); kayıt sayısı değişmez", async () => {
    const seed = await seedGovernance(prisma);
    const recordId = await seedRecord(seed.kpiId, seed.ownerId);

    h.userId = seed.pmoId;
    await lockPeriod(recordId);

    h.userId = seed.ownerId;
    const res = await saveKpiRecord(seed.kpiId, 100, 90, MAY, "tekrar");
    expect(res).toEqual({ success: false, error: expect.stringMatching(/kilitli/) });
    expect(await prisma.kPIPeriodRecord.count()).toBe(1);
  });

  it("non-admin kilitleyemez", async () => {
    const seed = await seedGovernance(prisma);
    const recordId = await seedRecord(seed.kpiId, seed.ownerId);

    h.userId = seed.ownerId; // KPI_OWNER
    const res = await lockPeriod(recordId);
    expect(res).toEqual({ success: false, error: expect.stringMatching(/ADMIN\/PMO/) });
    const rec = await prisma.kPIPeriodRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(rec.locked).toBe(false);
  });

  it("PMO kilidi açar (REOPEN denetimi) → sahip tekrar kayıt girebilir", async () => {
    const seed = await seedGovernance(prisma);
    const recordId = await seedRecord(seed.kpiId, seed.ownerId);

    h.userId = seed.pmoId;
    await lockPeriod(recordId);
    const reopen = await reopenPeriod(recordId);
    expect(reopen).toEqual({ success: true });

    const rec = await prisma.kPIPeriodRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(rec.locked).toBe(false);
    expect(rec.lockedById).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "REOPEN" } })).toBe(1);

    h.userId = seed.ownerId;
    const res = await saveKpiRecord(seed.kpiId, 100, 90, MAY, "tekrar");
    expect(res).toEqual({ success: true });
    expect(await prisma.kPIPeriodRecord.count()).toBe(2);
  });
});
