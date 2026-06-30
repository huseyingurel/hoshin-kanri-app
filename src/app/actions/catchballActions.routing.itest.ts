/**
 * FR-08: tüm CatchballItem tiplerinin kalıcılığı ve sıralı erişim.
 * FR-09: toRole / toDeptId yönlendirme alanlarının kalıcılığı.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { postCatchball, transitionCatchball, getThread } from "@/app/actions/catchballActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("catchball FR-08/FR-09 (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  // --- FR-08: tüm öğe tipleri ---

  it("COMMENT tipi öğe kalıcı olarak yazılır ve getThread ile alınır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "Standart yorum",
      itemType: "COMMENT",
    });
    expect(res.success).toBe(true);

    const thread = await getThread("HOSHIN", seed.hoshinId);
    const item = thread.items.find((i) => i.type === "COMMENT");
    expect(item).toBeTruthy();
    expect(item!.message).toBe("Standart yorum");
  });

  it("REVISION_REQUEST tipi öğe kalıcı olarak yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "Revizyon gerekiyor",
      itemType: "REVISION_REQUEST",
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, type: "REVISION_REQUEST" },
    });
    expect(item).toBeTruthy();
    expect(item!.message).toBe("Revizyon gerekiyor");
  });

  it("COUNTER_PROPOSAL tipi öğe kalıcı olarak yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "Karşı öneri: alternatif yaklaşım",
      itemType: "COUNTER_PROPOSAL",
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, type: "COUNTER_PROPOSAL" },
    });
    expect(item).toBeTruthy();
  });

  it("APPROVAL tipi postCatchball üzerinden reddedilir (transitionCatchball gerektirir)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "Onayla",
      itemType: "APPROVAL",
    });
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/transitionCatchball/);
  });

  it("tüm tipler sıralı olarak getThread ile alınır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // Durum geçişleri + yorumlar sırayla
    await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "IN_REVIEW", message: "İncelemeye gönderildi" });
    await postCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, message: "Yorum 1", itemType: "COMMENT" });
    await postCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, message: "Revizyon talebi", itemType: "REVISION_REQUEST" });
    await postCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, message: "Karşı öneri", itemType: "COUNTER_PROPOSAL" });

    const thread = await getThread("HOSHIN", seed.hoshinId);
    expect(thread.items.length).toBeGreaterThanOrEqual(4);

    const types = thread.items.map((i) => i.type);
    // Sıralama: ilk geçiş (REVISION_REQUEST veya APPROVAL tipi olan) → sonraki yorumlar
    expect(types).toContain("COMMENT");
    expect(types).toContain("REVISION_REQUEST");
    expect(types).toContain("COUNTER_PROPOSAL");
  });

  it("APPROVAL transitionCatchball ile kalıcı olarak yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // AGREED durumuna kadar ilerle
    await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "IN_REVIEW", message: "İncelemeye" });
    await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "AGREED", message: "Mutabık" });
    const res = await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "APPROVED", message: "Onaylandı" });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, type: "APPROVAL" },
    });
    expect(item).toBeTruthy();
    expect(item!.resultingStatus).toBe("APPROVED");
  });

  it("REJECTION transitionCatchball ile kalıcı olarak yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "IN_REVIEW", message: "İncelemeye" });
    const res = await transitionCatchball({ entityType: "HOSHIN", entityId: seed.hoshinId, to: "REJECTED", message: "Reddedildi" });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, type: "REJECTION" },
    });
    expect(item).toBeTruthy();
    expect(item!.resultingStatus).toBe("REJECTED");
  });

  // --- FR-09: toRole / toDeptId yönlendirme ---

  it("postCatchball toRole alanını kalıcı olarak yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "PMO onayı gerekiyor",
      itemType: "REVISION_REQUEST",
      toRole: "PMO",
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, type: "REVISION_REQUEST" },
    });
    expect(item).toBeTruthy();
    expect(item!.toRole).toBe("PMO");
  });

  it("postCatchball toDeptId alanını kalıcı olarak yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await postCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      message: "Üretim departmanı incelemesi",
      itemType: "COMMENT",
      toDeptId: seed.deptId,
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, toDeptId: seed.deptId },
    });
    expect(item).toBeTruthy();
    expect(item!.toDeptId).toBe(seed.deptId);
  });

  it("transitionCatchball toRole alanını kalıcı olarak yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await transitionCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      to: "IN_REVIEW",
      message: "Yönetici incelemesi için",
      toRole: "EXECUTIVE",
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, toRole: "EXECUTIVE" },
    });
    expect(item).toBeTruthy();
    expect(item!.toRole).toBe("EXECUTIVE");
  });

  it("transitionCatchball toDeptId alanını kalıcı olarak yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    const res = await transitionCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      to: "IN_REVIEW",
      message: "Departman incelemesi",
      toDeptId: seed.deptId,
    });
    expect(res.success).toBe(true);

    const item = await prisma.catchballItem.findFirst({
      where: { entityId: seed.hoshinId, toDeptId: seed.deptId },
    });
    expect(item).toBeTruthy();
    expect(item!.toDeptId).toBe(seed.deptId);
  });
});
