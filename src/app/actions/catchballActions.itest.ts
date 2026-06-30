import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { getThread, transitionCatchball } from "@/app/actions/catchballActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

/** majorTask'ı olmayan "yabancı" bir hoshin: departman kapsamlı bir kullanıcının
 * kapsamına girmez (hoshinScopeFilter majorTasks→actionPlans üzerinden eşleşir). */
async function foreignHoshin() {
  return prisma.hoshin.create({ data: { title: "Başka Birim", year: 2026, type: "ANNUAL" } });
}

describe("catchballActions kapsam denetimi (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("departman kapsamlı kullanıcı kapsam dışı hoshin'i değiştiremez ve hiçbir şey yazmaz (INV-4/INV-7)", async () => {
    const seed = await seedGovernance(prisma);
    const foreign = await foreignHoshin();
    h.userId = seed.ownerId; // KPI_OWNER, departman kapsamlı

    const res = await transitionCatchball({
      entityType: "HOSHIN",
      entityId: foreign.id,
      to: "IN_REVIEW",
      message: "deneme",
    });

    expect(res.success).toBe(false);
    // Atomik ret: durum DRAFT kalır, öğe yok, denetim yok.
    const after = await prisma.hoshin.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.catchballStatus).toBe("DRAFT");
    expect(await prisma.catchballItem.count({ where: { entityId: foreign.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: foreign.id } })).toBe(0);
  });

  it("kapsam içindeki hoshin için geçiş başarılı: durum + öğe + denetim yazılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // seedlenen hoshin owner'ın kapsamında (actionPlan owner'a ait)

    const res = await transitionCatchball({
      entityType: "HOSHIN",
      entityId: seed.hoshinId,
      to: "IN_REVIEW",
      message: "incelemeye gönderildi",
    });

    expect(res.success).toBe(true);
    const after = await prisma.hoshin.findUniqueOrThrow({ where: { id: seed.hoshinId } });
    expect(after.catchballStatus).toBe("IN_REVIEW");
    expect(await prisma.catchballItem.count({ where: { entityId: seed.hoshinId } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: "TRANSITION", entityId: seed.hoshinId } }),
    ).toBe(1);
  });

  it("kurum geneli rol (PMO) kapsam dışı hoshin'i de değiştirebilir", async () => {
    const seed = await seedGovernance(prisma);
    const foreign = await foreignHoshin();
    h.userId = seed.pmoId; // PMO = kurum geneli

    const res = await transitionCatchball({
      entityType: "HOSHIN",
      entityId: foreign.id,
      to: "IN_REVIEW",
      message: "pmo incelemesi",
    });

    expect(res.success).toBe(true);
    const after = await prisma.hoshin.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.catchballStatus).toBe("IN_REVIEW");
  });

  it("getThread kapsam dışı varlık için boş döner (okuma da kapsamlanır)", async () => {
    const seed = await seedGovernance(prisma);
    const foreign = await foreignHoshin();
    h.userId = seed.ownerId;

    const thread = await getThread("HOSHIN", foreign.id);
    expect(thread.status).toBeNull();
    expect(thread.items).toHaveLength(0);
  });
});
