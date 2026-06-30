import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/engine/notifications";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

describe("notify / notifyMany (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    log?.restore();
    log = null;
  });

  it("bildirim oluşturur ve notification.created loglar", async () => {
    const seed = await seedGovernance(prisma);
    log = captureLogEvents();

    const { notification, created } = await prisma.$transaction((tx) =>
      notify(tx, {
        userId: seed.ownerId,
        type: "KPI_RED",
        title: "KPI kırmızı",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
      }),
    );

    expect(created).toBe(true);
    expect(notification.channel).toBe("IN_APP");
    expect(notification.readAt).toBeNull();
    expect(log.byEvent("notification.created")).toHaveLength(1);
  });

  it("INV-3: aynı beşli ikinci kez bastırılır (tek satır)", async () => {
    const seed = await seedGovernance(prisma);
    const payload = {
      userId: seed.ownerId,
      type: "KPI_RED" as const,
      title: "KPI kırmızı",
      entityType: "KPI",
      entityId: seed.kpiId,
      periodKey: "2026-M05",
    };

    const first = await prisma.$transaction((tx) => notify(tx, payload));
    const second = await prisma.$transaction((tx) => notify(tx, payload));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);
    expect(await prisma.notificationLog.count()).toBe(1);
  });

  it("idempotent:false her zaman yeni satır üretir", async () => {
    const seed = await seedGovernance(prisma);
    const payload = {
      userId: seed.ownerId,
      type: "CATCHBALL_REQUEST" as const,
      title: "İnceleme",
      entityType: "KPI",
      entityId: seed.kpiId,
      idempotent: false,
    };
    await prisma.$transaction((tx) => notify(tx, payload));
    await prisma.$transaction((tx) => notify(tx, payload));
    expect(await prisma.notificationLog.count()).toBe(2);
  });

  it("entityId yoksa dedupeKey null'dur ve bastırma yapılmaz", async () => {
    const seed = await seedGovernance(prisma);
    const payload = {
      userId: seed.ownerId,
      type: "REVIEW_UPCOMING" as const,
      title: "Toplantı yaklaşıyor",
    };
    const a = await prisma.$transaction((tx) => notify(tx, payload));
    const b = await prisma.$transaction((tx) => notify(tx, payload));
    expect(a.notification.dedupeKey).toBeNull();
    expect(b.created).toBe(true);
    expect(await prisma.notificationLog.count()).toBe(2);
  });

  it("notifyMany birden çok alıcıya gönderir", async () => {
    const seed = await seedGovernance(prisma);
    const results = await prisma.$transaction((tx) =>
      notifyMany(tx, [{ id: seed.sponsorId }, { id: seed.pmoId }], {
        type: "STRATEGIC_ESCALATION",
        title: "Stratejik eskalasyon",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
      }),
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.created)).toBe(true);
    expect(await prisma.notificationLog.count()).toBe(2);
  });
});
