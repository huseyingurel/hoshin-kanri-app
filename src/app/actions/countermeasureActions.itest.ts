import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import {
  convertCountermeasureToTask,
  updateCountermeasure,
} from "@/app/actions/countermeasureActions";
import { createReview } from "@/app/actions/reviewActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("countermeasureActions (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  // FR-23
  it("convertCountermeasureToTask: countermeasureId FK'li MANUAL görev + CREATE denetimi açar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const cm = await prisma.countermeasure.create({
      data: {
        kpiId: seed.kpiId,
        problemStatement: "Hat duruşları arttı",
        actionSummary: "Önleyici bakım planı uygulanacak",
        rootCause: "Yıpranan rulmanlar",
        ownerUserId: seed.ownerId,
        dueDate: new Date(Date.UTC(2026, 5, 1)),
      },
    });

    const res = await convertCountermeasureToTask(cm.id);
    expect(res).toEqual({ success: true });

    const task = await prisma.task.findFirstOrThrow({ where: { countermeasureId: cm.id } });
    expect(task).toMatchObject({
      source: "MANUAL",
      status: "OPEN",
      assigneeId: seed.ownerId, // sahibe atanır
      kpiId: seed.kpiId,
      title: "Önleyici bakım planı uygulanacak",
    });
    expect(task.dueDate?.getTime()).toBe(Date.UTC(2026, 5, 1));

    expect(
      await prisma.auditLog.count({ where: { action: "CREATE", entityType: "Task", entityId: task.id } })
    ).toBe(1);
  });

  it("convertCountermeasureToTask: sahibi yoksa görev oturum sahibine atanır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const cm = await prisma.countermeasure.create({
      data: { kpiId: seed.kpiId, problemStatement: "Sahipsiz problem" },
    });

    const res = await convertCountermeasureToTask(cm.id);
    expect(res).toEqual({ success: true });

    const task = await prisma.task.findFirstOrThrow({ where: { countermeasureId: cm.id } });
    expect(task.assigneeId).toBe(seed.pmoId);
    expect(task.title).toBe("Sahipsiz problem"); // actionSummary yoksa problemStatement
  });

  it("convertCountermeasureToTask: oturum yoksa hata döner, görev açılmaz", async () => {
    const seed = await seedGovernance(prisma);
    const cm = await prisma.countermeasure.create({
      data: { kpiId: seed.kpiId, problemStatement: "P" },
    });
    h.userId = null;

    const res = await convertCountermeasureToTask(cm.id);
    expect(res.success).toBe(false);
    expect(await prisma.task.count({ where: { countermeasureId: cm.id } })).toBe(0);
  });

  // FR-22
  it("updateCountermeasure: kapatırken closureNote yazar, dueDate string'i Date'e çevirir", async () => {
    const seed = await seedGovernance(prisma);
    const cm = await prisma.countermeasure.create({
      data: { kpiId: seed.kpiId, problemStatement: "Açık problem" },
    });

    await updateCountermeasure(cm.id, { dueDate: "2026-09-15", expectedImpact: "Sapma kapanır" });
    let after = await prisma.countermeasure.findUniqueOrThrow({ where: { id: cm.id } });
    expect(after.dueDate?.getTime()).toBe(Date.UTC(2026, 8, 15));
    expect(after.expectedImpact).toBe("Sapma kapanır");

    await updateCountermeasure(cm.id, { status: "CLOSED", closureNote: "Bakım tamamlandı" });
    after = await prisma.countermeasure.findUniqueOrThrow({ where: { id: cm.id } });
    expect(after.status).toBe("CLOSED");
    expect(after.closureNote).toBe("Bakım tamamlandı");
  });

  it("updateCountermeasure: boş dueDate string'i tarihi temizler (null)", async () => {
    const seed = await seedGovernance(prisma);
    const cm = await prisma.countermeasure.create({
      data: { kpiId: seed.kpiId, problemStatement: "P", dueDate: new Date() },
    });
    await updateCountermeasure(cm.id, { dueDate: "" });
    const after = await prisma.countermeasure.findUniqueOrThrow({ where: { id: cm.id } });
    expect(after.dueDate).toBeNull();
  });
});

// FR-30
describe("createReview meta (entegrasyon)", () => {
  it("frequency/chair/coordinator değerlerini kaydeder", async () => {
    const seed = await seedGovernance(prisma);
    const review = await createReview({
      title: "Aylık Kurul",
      type: "MEETING",
      date: new Date(),
      frequency: "MONTHLY",
      chairUserId: seed.sponsorId,
      coordinatorUserId: seed.pmoId,
    });

    const after = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(after).toMatchObject({
      frequency: "MONTHLY",
      chairUserId: seed.sponsorId,
      coordinatorUserId: seed.pmoId,
    });
  });

  it("meta verilmezse alanlar null kalır", async () => {
    const review = await createReview({ title: "Boş meta", type: "EXPERT_REVIEW", date: new Date() });
    const after = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(after.frequency).toBeNull();
    expect(after.chairUserId).toBeNull();
    expect(after.coordinatorUserId).toBeNull();
  });
});
