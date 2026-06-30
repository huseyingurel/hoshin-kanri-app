import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { upsertSystemTask } from "@/lib/engine/tasks";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

describe("upsertSystemTask (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    log?.restore();
    log = null;
  });

  it("ilk çağrı görevi oluşturur (created=true) ve task.created loglar", async () => {
    const seed = await seedGovernance(prisma);
    log = captureLogEvents();

    const { task, created } = await prisma.$transaction((tx) =>
      upsertSystemTask(tx, {
        type: "RED_KPI_REVIEW",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
        title: "RED KPI incelemesi",
        priority: "HIGH",
        assigneeId: seed.ownerId,
        assigneeDeptId: seed.deptId,
        links: { kpiId: seed.kpiId },
      }),
    );

    expect(created).toBe(true);
    expect(task.dedupeKey).toBe("RED_KPI_REVIEW:KPI:" + seed.kpiId + ":2026-M05");
    expect(task.priority).toBe("HIGH");
    expect(task.kpiId).toBe(seed.kpiId);
    expect(log.byEvent("task.created")).toHaveLength(1);
  });

  it("INV-2: aynı dedupeKey ikinci kez çağrılınca atlanır (tek satır)", async () => {
    const seed = await seedGovernance(prisma);

    const first = await prisma.$transaction((tx) =>
      upsertSystemTask(tx, {
        type: "RED_KPI_REVIEW",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
        title: "RED KPI incelemesi",
      }),
    );

    log = captureLogEvents();
    const second = await prisma.$transaction((tx) =>
      upsertSystemTask(tx, {
        type: "RED_KPI_REVIEW",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
        title: "Farklı başlık ama aynı anahtar",
      }),
    );

    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(second.task.title).toBe("RED KPI incelemesi"); // mevcut korunur, ezilmez
    expect(log.byEvent("task.skipped_duplicate")).toHaveLength(1);
    expect(await prisma.task.count()).toBe(1);
  });

  it("farklı periodKey farklı görev üretir", async () => {
    const seed = await seedGovernance(prisma);
    await prisma.$transaction((tx) =>
      upsertSystemTask(tx, {
        type: "PERIOD_ENTRY",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M05",
        title: "Mayıs girişi",
      }),
    );
    await prisma.$transaction((tx) =>
      upsertSystemTask(tx, {
        type: "PERIOD_ENTRY",
        entityType: "KPI",
        entityId: seed.kpiId,
        periodKey: "2026-M06",
        title: "Haziran girişi",
      }),
    );
    expect(await prisma.task.count()).toBe(2);
  });
});
