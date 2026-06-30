import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { updateKpiMeta, getKpiAuditHistory } from "@/app/actions/kpiMetaActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("updateKpiMeta (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("meta değişimini diff denetimiyle yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId; // kurum geneli
    const res = await updateKpiMeta(seed.kpiId, { targetYear: 120, definition: "Yeni tanım", redThreshold: -15 });
    expect(res.success).toBe(true);

    const after = await prisma.kPI.findUniqueOrThrow({ where: { id: seed.kpiId } });
    expect(after.targetYear).toBe(120);
    expect(after.definition).toBe("Yeni tanım");
    expect(after.redThreshold).toBe(-15);

    const audits = await getKpiAuditHistory(seed.kpiId);
    const upd = audits.find((a) => a.action === "UPDATE" && a.context === "updateKpiMeta");
    expect(upd).toBeTruthy();
    const changedFields = (upd!.changes as Array<{ field: string }>).map((c) => c.field).sort();
    expect(changedFields).toEqual(["definition", "redThreshold", "targetYear"]);
  });

  it("değişiklik yoksa no-op (denetim yazmaz)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const before = await prisma.auditLog.count({ where: { entityType: "KPI", entityId: seed.kpiId } });
    const res = await updateKpiMeta(seed.kpiId, { targetYear: 100 }); // mevcut değer
    expect(res.success).toBe(true);
    const after = await prisma.auditLog.count({ where: { entityType: "KPI", entityId: seed.kpiId } });
    expect(after).toBe(before);
  });

  it("geçersiz raporlama sıklığı reddedilir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const res = await updateKpiMeta(seed.kpiId, { reportingFrequency: "HAFTALIK" });
    expect(res.success).toBe(false);
  });

  it("kilitli dönem + hedef değişimi: yetkisiz rol reddedilir, ADMIN/PMO geçer", async () => {
    const seed = await seedGovernance(prisma);
    await prisma.kPIPeriodRecord.create({
      data: {
        kpiId: seed.kpiId,
        periodStart: new Date(Date.UTC(2026, 0, 1)),
        periodEnd: new Date(Date.UTC(2026, 0, 31)),
        targetValue: 100,
        actualValue: 90,
        locked: true,
      },
    });
    // KPI sahibi (KPI_OWNER) — kurum geneli değil
    h.userId = seed.ownerId;
    const denied = await updateKpiMeta(seed.kpiId, { targetYear: 150 });
    expect(denied.success).toBe(false);

    // PMO geçer
    h.userId = seed.pmoId;
    const ok = await updateKpiMeta(seed.kpiId, { targetYear: 150 });
    expect(ok.success).toBe(true);
  });

  it("yetkisiz kullanıcı (başka KPI sahibi olmayan) reddedilir", async () => {
    const seed = await seedGovernance(prisma);
    const stranger = await prisma.user.create({
      data: { name: "Yabancı", email: "stranger@test.local", role: "USER" },
    });
    h.userId = stranger.id;
    const res = await updateKpiMeta(seed.kpiId, { definition: "x" });
    expect(res.success).toBe(false);
  });
});
