import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { createDecision, getReviewAgendaItems } from "@/app/actions/reviewActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

describe("createDecision (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    h.userId = null;
    log?.restore();
    log = null;
  });

  it("karar + CREATE denetimi + DECISION_FOLLOWUP görevi + DECISION_ASSIGNED bildirimi tek tx'te", async () => {
    const seed = await seedGovernance(prisma);
    const review = await prisma.review.create({
      data: { title: "Aylık inceleme", type: "MEETING", date: new Date() },
    });
    h.userId = seed.pmoId;
    log = captureLogEvents();

    const decision = await createDecision({
      reviewId: review.id,
      decisionText: "Üretim hattında bakım planı çıkarılacak",
      assigneeId: seed.ownerId,
      kpiId: seed.kpiId,
    });

    expect(decision.id).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: "CREATE", entityType: "Decision" } })).toBe(1);

    const task = await prisma.task.findFirstOrThrow({ where: { type: "DECISION_FOLLOWUP" } });
    expect(task).toMatchObject({ decisionId: decision.id, kpiId: seed.kpiId, assigneeId: seed.ownerId });

    const notif = await prisma.notificationLog.findFirstOrThrow({ where: { type: "DECISION_ASSIGNED" } });
    expect(notif.userId).toBe(seed.ownerId);

    expect(log.byEvent("task.created")).toHaveLength(1);
    expect(log.byEvent("notification.created")).toHaveLength(1);
  });

  it("atanan yoksa bildirim yazılmaz ama görev yine açılır", async () => {
    const seed = await seedGovernance(prisma);
    const review = await prisma.review.create({
      data: { title: "Inceleme", type: "MEETING", date: new Date() },
    });
    h.userId = seed.pmoId;

    await createDecision({ reviewId: review.id, decisionText: "Genel takip" });

    expect(await prisma.task.count({ where: { type: "DECISION_FOLLOWUP" } })).toBe(1);
    expect(await prisma.notificationLog.count({ where: { type: "DECISION_ASSIGNED" } })).toBe(0);
  });

  it("gündem vadesi geçmiş açık görevleri içerir (G7)", async () => {
    const seed = await seedGovernance(prisma);
    const past = new Date(Date.UTC(2020, 0, 1));
    await prisma.task.create({
      data: {
        type: "OVERDUE_FOLLOWUP",
        title: "Geç kalan",
        status: "OPEN",
        dueDate: past,
        assigneeId: seed.pmoId,
      },
    });
    // Vadesi gelmemiş görev gündeme girmemeli.
    const future = new Date(Date.UTC(2999, 0, 1));
    await prisma.task.create({
      data: { type: "DUE_SOON", title: "Gelecek", status: "OPEN", dueDate: future, assigneeId: seed.pmoId },
    });

    h.userId = seed.pmoId; // kurum geneli → tüm görevler kapsamda
    const agenda = await getReviewAgendaItems();
    expect(agenda.overdueTasks).toHaveLength(1);
    expect(agenda.overdueTasks[0].title).toBe("Geç kalan");
  });
});
