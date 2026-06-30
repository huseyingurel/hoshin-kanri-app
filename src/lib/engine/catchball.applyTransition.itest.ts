import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { applyTransition, canActivate } from "@/lib/engine/catchball";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

describe("applyTransition (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    log?.restore();
    log = null;
  });

  it("yasal geçiş: durumu ilerletir, item + audit + bildirim yazar", async () => {
    const seed = await seedGovernance(prisma);
    log = captureLogEvents();

    const result = await prisma.$transaction((tx) =>
      applyTransition(tx, {
        entityType: "KPI",
        entityId: seed.kpiId,
        to: "IN_REVIEW",
        itemType: "REVISION_REQUEST",
        message: "Lütfen hedefi gözden geçirin",
        actorUserId: seed.ownerId,
        counterpartyUserId: seed.managerId,
      }),
    );

    expect(result).toMatchObject({ from: "DRAFT", to: "IN_REVIEW" });

    const kpi = await prisma.kPI.findUniqueOrThrow({ where: { id: seed.kpiId } });
    expect(kpi.catchballStatus).toBe("IN_REVIEW");

    const items = await prisma.catchballItem.findMany({ where: { entityId: seed.kpiId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "REVISION_REQUEST", resultingStatus: "IN_REVIEW" });

    const audits = await prisma.auditLog.findMany({ where: { action: "TRANSITION" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].changes).toEqual([
      { field: "catchballStatus", old: "DRAFT", new: "IN_REVIEW" },
    ]);

    const notifs = await prisma.notificationLog.findMany({ where: { userId: seed.managerId } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("CATCHBALL_REQUEST");

    expect(log.byEvent("catchball.transition")).toHaveLength(1);
  });

  it("tam zincir DRAFT→IN_REVIEW→AGREED→APPROVED, sonunda canActivate true", async () => {
    const seed = await seedGovernance(prisma);
    const step = (to: "IN_REVIEW" | "AGREED" | "APPROVED", itemType: "COMMENT" | "APPROVAL") =>
      prisma.$transaction((tx) =>
        applyTransition(tx, {
          entityType: "KPI",
          entityId: seed.kpiId,
          to,
          itemType,
          message: to,
          actorUserId: seed.managerId,
          counterpartyUserId: seed.ownerId,
        }),
      );

    await step("IN_REVIEW", "COMMENT");
    await step("AGREED", "COMMENT");
    await step("APPROVED", "APPROVAL");

    const kpi = await prisma.kPI.findUniqueOrThrow({ where: { id: seed.kpiId } });
    expect(kpi.catchballStatus).toBe("APPROVED");
    expect(canActivate(kpi.catchballStatus)).toBe(true);

    // Son geçiş onay olduğu için CATCHBALL_APPROVED bildirimi gönderilmiş olmalı.
    const approved = await prisma.notificationLog.findMany({
      where: { type: "CATCHBALL_APPROVED" },
    });
    expect(approved).toHaveLength(1);
  });

  it("INV-5/INV-7: yasadışı DRAFT→APPROVED fırlatır ve hiçbir şey yazmaz", async () => {
    const seed = await seedGovernance(prisma);

    await expect(
      prisma.$transaction((tx) =>
        applyTransition(tx, {
          entityType: "KPI",
          entityId: seed.kpiId,
          to: "APPROVED",
          itemType: "APPROVAL",
          message: "atlama denemesi",
          actorUserId: seed.ownerId,
        }),
      ),
    ).rejects.toThrow(/İzinsiz catchball geçişi/);

    const kpi = await prisma.kPI.findUniqueOrThrow({ where: { id: seed.kpiId } });
    expect(kpi.catchballStatus).toBe("DRAFT"); // değişmedi
    expect(await prisma.catchballItem.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await prisma.notificationLog.count()).toBe(0);
  });

  it("var olmayan varlık fırlatır", async () => {
    await seedGovernance(prisma);
    await expect(
      prisma.$transaction((tx) =>
        applyTransition(tx, {
          entityType: "KPI",
          entityId: "yok-boyle-bir-id",
          to: "IN_REVIEW",
          itemType: "COMMENT",
          message: "x",
        }),
      ),
    ).rejects.toThrow(/bulunamadı/);
  });
});
