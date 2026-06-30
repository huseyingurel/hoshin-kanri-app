import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import {
  setHoshinStatus,
  setMajorTaskStatus,
  setActionPlanStatus,
} from "@/app/actions/lifecycleActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("lifecycleActions (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  // --- setHoshinStatus ---

  it("geçerli hoshin durum geçişi diff denetimi yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId; // kurum geneli

    const res = await setHoshinStatus(seed.hoshinId, "ACTIVE");
    expect(res.success).toBe(true);

    const hoshin = await prisma.hoshin.findUniqueOrThrow({ where: { id: seed.hoshinId } });
    expect(hoshin.status).toBe("ACTIVE");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "TRANSITION", entityType: "Hoshin", entityId: seed.hoshinId },
    });
    expect(audit).toBeTruthy();
    const changes = audit!.changes as Array<{ field: string; old: unknown; new: unknown }>;
    const statusChange = changes.find((c) => c.field === "status");
    expect(statusChange?.old).toBe("DRAFT");
    expect(statusChange?.new).toBe("ACTIVE");
  });

  it("geçersiz hoshin durumu tipli hata döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await setHoshinStatus(seed.hoshinId, "GECERSIZ_DURUM");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/Geçersiz hoshin durumu/);
  });

  it("yetkisiz kullanıcı hoshin durumunu değiştiremez", async () => {
    const seed = await seedGovernance(prisma);
    // ownerId = KPI_OWNER, hoshin sponsorUserId = sponsorId → owner yetkisiz
    h.userId = seed.ownerId;

    const res = await setHoshinStatus(seed.hoshinId, "ACTIVE");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/yetkiniz yok/);
  });

  it("hoshin sponsoru durumu değiştirebilir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.sponsorId; // EXECUTIVE, hoshin'in sponsoru

    const res = await setHoshinStatus(seed.hoshinId, "ACTIVE");
    expect(res.success).toBe(true);
  });

  it("oturum yoksa kimlik doğrulama hatası döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = null; // oturum yok

    const res = await setHoshinStatus(seed.hoshinId, "ACTIVE");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/Oturum bulunamadı/);
  });

  // --- setMajorTaskStatus ---

  it("geçerli majorTask durum geçişi diff denetimi yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await setMajorTaskStatus(seed.majorTaskId, "ACTIVE");
    expect(res.success).toBe(true);

    const task = await prisma.majorTask.findUniqueOrThrow({ where: { id: seed.majorTaskId } });
    expect(task.status).toBe("ACTIVE");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "TRANSITION", entityType: "MajorTask", entityId: seed.majorTaskId },
    });
    expect(audit).toBeTruthy();
  });

  it("kurum geneli olmayan rol majorTask durumunu değiştiremez", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // KPI_OWNER

    const res = await setMajorTaskStatus(seed.majorTaskId, "ACTIVE");
    expect(res.success).toBe(false);
  });

  it("geçersiz majorTask durumu tipli hata döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await setMajorTaskStatus(seed.majorTaskId, "NOT_STARTED");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/Geçersiz ana görev durumu/);
  });

  // --- setActionPlanStatus ---

  it("geçerli actionPlan durum geçişi diff denetimi yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await setActionPlanStatus(seed.actionPlanId, "IN_PROGRESS");
    expect(res.success).toBe(true);

    const ap = await prisma.actionPlan.findUniqueOrThrow({ where: { id: seed.actionPlanId } });
    expect(ap.status).toBe("IN_PROGRESS");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "TRANSITION", entityType: "ActionPlan", entityId: seed.actionPlanId },
    });
    expect(audit).toBeTruthy();
    const changes = audit!.changes as Array<{ field: string; old: unknown; new: unknown }>;
    const statusChange = changes.find((c) => c.field === "status");
    expect(statusChange?.old).toBe("NOT_STARTED");
    expect(statusChange?.new).toBe("IN_PROGRESS");
  });

  it("actionPlan sahibi durumu değiştirebilir (kurum geneli rol gerekmez)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // actionPlan'ın ownerUserId'si

    const res = await setActionPlanStatus(seed.actionPlanId, "IN_PROGRESS");
    expect(res.success).toBe(true);
  });

  it("actionPlan sahibi olmayan yetkisiz kullanıcı reddedilir", async () => {
    const seed = await seedGovernance(prisma);
    const stranger = await prisma.user.create({
      data: { name: "Yabancı", email: "lifecycle_stranger@test.local", role: "USER" },
    });
    h.userId = stranger.id;

    const res = await setActionPlanStatus(seed.actionPlanId, "IN_PROGRESS");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/yetkiniz yok/);
  });

  it("geçersiz actionPlan durumu tipli hata döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await setActionPlanStatus(seed.actionPlanId, "DRAFT");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/Geçersiz aksiyon planı durumu/);
  });
});
