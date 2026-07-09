import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { duplicateHoshin } from "@/app/actions/strategyActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("duplicateHoshin (FR-04 entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("kurum geneli rol Hoshin'i alt ağacıyla taslak olarak çoğaltır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId; // kurum geneli

    // Kaynağı işletimsel bir duruma taşı + per-KPI eşik ekle → kopyada sıfırlanmalı.
    await prisma.hoshin.update({ where: { id: seed.hoshinId }, data: { status: "ACTIVE", catchballStatus: "AGREED" } });
    await prisma.kPI.update({ where: { id: seed.kpiId }, data: { redThreshold: -12, amberThreshold: -6 } });

    const res = await duplicateHoshin(seed.hoshinId);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.hoshinId).not.toBe(seed.hoshinId);

    const clone = await prisma.hoshin.findUniqueOrThrow({
      where: { id: res.hoshinId },
      include: { majorTasks: { include: { actionPlans: { include: { kpis: true } } } } },
    });

    // Başlık çakışma çözümü + durumlar taslağa döndü, vizyon/sponsor korundu.
    expect(clone.title).toBe("2026 Stratejisi (Kopya)");
    expect(clone.year).toBe(2026);
    expect(clone.status).toBe("DRAFT");
    expect(clone.catchballStatus).toBe("DRAFT");
    expect(clone.sponsorUserId).toBe(seed.sponsorId);

    // Alt ağaç kopyalandı; eşikler korundu; durumlar sıfırlandı.
    expect(clone.majorTasks).toHaveLength(1);
    const ap = clone.majorTasks[0].actionPlans[0];
    expect(ap.status).toBe("NOT_STARTED");
    expect(ap.progressPercent).toBe(0);
    expect(ap.ownerUserId).toBe(seed.ownerId);
    const kpi = ap.kpis[0];
    expect(kpi.name).toBe("Üretim Verimliliği");
    expect(kpi.redThreshold).toBe(-12);
    expect(kpi.amberThreshold).toBe(-6);
    expect(kpi.catchballStatus).toBe("DRAFT");

    // Yeni KPI, kaynaktan ayrı bir kayıt.
    expect(kpi.id).not.toBe(seed.kpiId);

    // Denetim kaydı yazıldı.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "CREATE", entityType: "Hoshin", entityId: res.hoshinId, context: "duplicateHoshin" },
    });
    expect(audit).toBeTruthy();
  });

  it("işletimsel veriyi (dönem kaydı / karşı önlem) KOPYALAMAZ", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    await prisma.kPIPeriodRecord.create({
      data: {
        kpiId: seed.kpiId,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
        targetValue: 100,
        actualValue: 80,
        statusColor: "RED",
      },
    });
    await prisma.countermeasure.create({
      data: { kpiId: seed.kpiId, problemStatement: "Sapma", status: "OPEN" },
    });

    const res = await duplicateHoshin(seed.hoshinId);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const clone = await prisma.hoshin.findUniqueOrThrow({
      where: { id: res.hoshinId },
      include: { majorTasks: { include: { actionPlans: { include: { kpis: true } } } } },
    });
    const newKpiId = clone.majorTasks[0].actionPlans[0].kpis[0].id;

    const periods = await prisma.kPIPeriodRecord.count({ where: { kpiId: newKpiId } });
    const cms = await prisma.countermeasure.count({ where: { kpiId: newKpiId } });
    expect(periods).toBe(0);
    expect(cms).toBe(0);
  });

  it("ardışık çoğaltmalar artan (Kopya n) başlığı üretir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const r1 = await duplicateHoshin(seed.hoshinId);
    const r2 = await duplicateHoshin(seed.hoshinId);
    expect(r1.success && r2.success).toBe(true);
    if (!r1.success || !r2.success) return;

    const t1 = (await prisma.hoshin.findUniqueOrThrow({ where: { id: r1.hoshinId } })).title;
    const t2 = (await prisma.hoshin.findUniqueOrThrow({ where: { id: r2.hoshinId } })).title;
    expect(t1).toBe("2026 Stratejisi (Kopya)");
    expect(t2).toBe("2026 Stratejisi (Kopya 2)");
  });

  it("kurum geneli olmayan rol çoğaltamaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // KPI_OWNER

    const res = await duplicateHoshin(seed.hoshinId);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/kurum geneli/);
  });

  it("oturum yoksa kimlik doğrulama hatası döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = null;

    const res = await duplicateHoshin(seed.hoshinId);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/Oturum bulunamadı/);
  });
});
