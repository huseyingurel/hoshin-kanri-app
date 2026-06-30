import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import {
  createVision,
  updateVision,
  deleteVision,
  linkHoshinToVision,
  listVisions,
} from "@/app/actions/visionActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("visionActions (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("vizyon oluşturur ve denetim satırı yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await createVision({ statement: "2030 Liderlik Vizyonu", year: 2030 });
    expect(res.success).toBe(true);

    const vision = await prisma.vision.findFirstOrThrow({
      where: { statement: "2030 Liderlik Vizyonu", year: 2030 },
    });
    expect(vision.status).toBe("DRAFT");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CREATE", entityType: "Vision", entityId: vision.id },
    });
    expect(audit).toBeTruthy();
    expect(audit!.context).toBe("createVision");
  });

  it("aynı statement+year çakışması tipli hata döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    await createVision({ statement: "Çakışan Vizyon", year: 2031 });
    const second = await createVision({ statement: "Çakışan Vizyon", year: 2031 });

    expect(second.success).toBe(false);
    expect((second as { success: false; error: string }).error).toMatch(/vizyon zaten mevcut/);
  });

  it("geçersiz durum reddedilir (tipli hata)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await createVision({ statement: "Geçersiz Durum", year: 2032, status: "GECERSIZ" });
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/Geçersiz vizyon durumu/);
  });

  it("kurum geneli olmayan rol vizyon oluşturamaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // KPI_OWNER → kurum geneli değil

    const res = await createVision({ statement: "Yetkisiz Vizyon", year: 2033 });
    expect(res.success).toBe(false);
  });

  it("linkHoshinToVision: hoshin.visionId güncellenir ve denetim satırı yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // Önce vizyon oluştur
    await createVision({ statement: "Bağlantı Testi", year: 2034 });
    const vision = await prisma.vision.findFirstOrThrow({ where: { year: 2034 } });

    const res = await linkHoshinToVision(seed.hoshinId, vision.id);
    expect(res.success).toBe(true);

    const hoshin = await prisma.hoshin.findUniqueOrThrow({ where: { id: seed.hoshinId } });
    expect(hoshin.visionId).toBe(vision.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE", entityType: "Hoshin", entityId: seed.hoshinId, context: "linkHoshinToVision" },
    });
    expect(audit).toBeTruthy();
    const changes = audit!.changes as Array<{ field: string; old: unknown; new: unknown }>;
    const visionChange = changes.find((c) => c.field === "visionId");
    expect(visionChange?.new).toBe(vision.id);
  });

  it("linkHoshinToVision null: bağlantı kaldırılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    await createVision({ statement: "Kaldırma Testi", year: 2035 });
    const vision = await prisma.vision.findFirstOrThrow({ where: { year: 2035 } });
    await linkHoshinToVision(seed.hoshinId, vision.id);

    const res = await linkHoshinToVision(seed.hoshinId, null);
    expect(res.success).toBe(true);

    const hoshin = await prisma.hoshin.findUniqueOrThrow({ where: { id: seed.hoshinId } });
    expect(hoshin.visionId).toBeNull();
  });

  it("updateVision: değişiklikler diff denetimiyle yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    await createVision({ statement: "Güncelleme Testi", year: 2036 });
    const vision = await prisma.vision.findFirstOrThrow({ where: { year: 2036 } });

    const res = await updateVision(vision.id, { status: "ACTIVE", description: "Yeni açıklama" });
    expect(res.success).toBe(true);

    const updated = await prisma.vision.findUniqueOrThrow({ where: { id: vision.id } });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.description).toBe("Yeni açıklama");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE", entityType: "Vision", entityId: vision.id, context: "updateVision" },
    });
    expect(audit).toBeTruthy();
  });

  it("listVisions: departman kapsamlı kullanıcı yalnız bağlı vizyonları görür", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // Vizyon oluştur ve hoshini bağla
    await createVision({ statement: "Kapsam Testi Vizyonu", year: 2037 });
    const vision = await prisma.vision.findFirstOrThrow({ where: { year: 2037 } });
    await linkHoshinToVision(seed.hoshinId, vision.id);

    // Bağlantısız ikinci vizyon
    await createVision({ statement: "Bağlantısız Vizyon", year: 2038 });

    // Departman kapsamlı kullanıcı yalnız bağlı vizyonu görür
    h.userId = seed.ownerId; // KPI_OWNER
    const visions = await listVisions();
    const ids = visions.map((v) => v.id);
    expect(ids).toContain(vision.id);
    expect(ids).not.toContain(
      (await prisma.vision.findFirstOrThrow({ where: { year: 2038 } })).id,
    );
  });
});
