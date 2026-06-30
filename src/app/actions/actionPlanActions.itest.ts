import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { createActionPlanFromDecision } from "@/app/actions/actionPlanActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

async function makeReview() {
  return prisma.review.create({ data: { title: "T", type: "MEETING", date: new Date() } });
}

describe("createActionPlanFromDecision (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("KPI zincirine bağlı karardan ActionPlan oluşturur + Decision'ı bağlar + denetim yazar", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();
    const decision = await prisma.decision.create({
      data: { reviewId: review.id, decisionText: "Bütçe artır", status: "OPEN", kpiId: seed.kpiId, assigneeId: seed.ownerId },
    });

    const res = await createActionPlanFromDecision(decision.id);
    expect(res.success).toBe(true);
    const apId = res.success ? res.data!.actionPlanId : "";

    const ap = await prisma.actionPlan.findUniqueOrThrow({ where: { id: apId } });
    expect(ap.ownerUserId).toBe(seed.ownerId);
    expect(ap.majorTaskId).toBe(seed.majorTaskId); // KPI→AP→MajorTask zincirinden

    const after = await prisma.decision.findUniqueOrThrow({ where: { id: decision.id } });
    expect(after.actionPlanId).toBe(apId);

    expect(await prisma.auditLog.count({ where: { entityType: "ActionPlan", entityId: apId, action: "CREATE" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: "Decision", entityId: decision.id, action: "UPDATE" } })).toBe(1);
  });

  it("KPI'ya bağlı olmayan karar → typed hata, plan oluşmaz (uydurmaz)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();
    const decision = await prisma.decision.create({
      data: { reviewId: review.id, decisionText: "Bağsız karar", status: "OPEN" },
    });
    const res = await createActionPlanFromDecision(decision.id);
    expect(res.success).toBe(false);
    expect(await prisma.actionPlan.count({ where: { title: "Bağsız karar" } })).toBe(0);
  });

  it("zaten bağlı karar → typed hata", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();
    const decision = await prisma.decision.create({
      data: { reviewId: review.id, decisionText: "X", status: "OPEN", kpiId: seed.kpiId, actionPlanId: seed.actionPlanId },
    });
    const res = await createActionPlanFromDecision(decision.id);
    expect(res.success).toBe(false);
  });

  it("oturum yoksa hata", async () => {
    const seed = await seedGovernance(prisma);
    const review = await makeReview();
    const decision = await prisma.decision.create({
      data: { reviewId: review.id, decisionText: "X", status: "OPEN", kpiId: seed.kpiId },
    });
    h.userId = null;
    const res = await createActionPlanFromDecision(decision.id);
    expect(res.success).toBe(false);
  });
});
