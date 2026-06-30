import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { runDailySweep } from "@/lib/engine/sweep";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

const JAN = new Date(Date.UTC(2026, 0, 15));
const JUNE_END = new Date(Date.UTC(2026, 5, 30));

/** Bir KPI dönem kaydı oluşturur (test verisi; saveKpiRecord yan etkileri olmadan). */
async function seedRecord(kpiId: string, year: number, month: number, statusColor: string) {
  return prisma.kPIPeriodRecord.create({
    data: {
      kpiId,
      periodStart: new Date(Date.UTC(year, month, 1)),
      periodEnd: new Date(Date.UTC(year, month + 1, 0)),
      targetValue: 100,
      actualValue: statusColor === "RED" ? 40 : 100,
      statusColor,
    },
  });
}

describe("runDailySweep (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    log?.restore();
    log = null;
  });

  it("kaydı olmayan açık dönem için PERIOD_ENTRY görevi + PERIOD_OPENED bildirimi üretir", async () => {
    const seed = await seedGovernance(prisma);

    const summary = await runDailySweep({ now: JAN });

    expect(summary.failures).toHaveLength(0);
    const tasks = await prisma.task.findMany({ where: { type: "PERIOD_ENTRY" } });
    expect(tasks).toHaveLength(1); // yalnız 2026-M01 açık
    expect(tasks[0]).toMatchObject({
      kpiId: seed.kpiId,
      periodKey: "2026-M01",
      assigneeId: seed.ownerId,
      assigneeDeptId: seed.deptId,
    });

    const notifs = await prisma.notificationLog.findMany({ where: { type: "PERIOD_OPENED" } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(seed.ownerId);
    expect(summary.generated).toBeGreaterThanOrEqual(1);
  });

  it("ikinci kez çalıştırınca idempotan: yeni görev/bildirim üretmez", async () => {
    await seedGovernance(prisma);

    await runDailySweep({ now: JAN });
    const second = await runDailySweep({ now: JAN });

    expect(await prisma.task.count({ where: { type: "PERIOD_ENTRY" } })).toBe(1);
    expect(await prisma.notificationLog.count({ where: { type: "PERIOD_OPENED" } })).toBe(1);
    expect(second.generated).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect(second.failures).toHaveLength(0);
  });

  it("2 ardışık RED → seviye 2 RED_KPI_REVIEW + STRATEGIC_ESCALATION (sponsor+PMO) + ESCALATE denetimi", async () => {
    const seed = await seedGovernance(prisma);
    await seedRecord(seed.kpiId, 2026, 4, "RED"); // Mayıs
    await seedRecord(seed.kpiId, 2026, 5, "RED"); // Haziran (en yeni)
    log = captureLogEvents();

    const summary = await runDailySweep({ now: JUNE_END });

    const red = await prisma.task.findFirstOrThrow({
      where: { type: "RED_KPI_REVIEW", periodKey: "2026-M06" },
    });
    expect(red.escalationLevel).toBe(2);

    expect(await prisma.notificationLog.count({ where: { type: "KPI_RED" } })).toBe(1);
    const esc = await prisma.notificationLog.findMany({ where: { type: "STRATEGIC_ESCALATION" } });
    expect(esc.map((n) => n.userId).sort()).toEqual([seed.sponsorId, seed.pmoId].sort());
    expect(await prisma.auditLog.count({ where: { action: "ESCALATE", context: "sweep" } })).toBe(1);
    expect(summary.escalated).toBe(1);
    expect(log.byEvent("escalation.raised")).toHaveLength(1);
  });

  it("vadesi geçen açık görev → seviye 1'e yükseltilir + atanan ve yöneticisine OVERDUE", async () => {
    const seed = await seedGovernance(prisma);
    const task = await prisma.task.create({
      data: {
        type: "DECISION_FOLLOWUP",
        title: "Geç kalan",
        status: "OPEN",
        dueDate: new Date(Date.UTC(2020, 0, 1)),
        assigneeId: seed.ownerId,
        escalationLevel: 0,
      },
    });

    await runDailySweep({ now: JUNE_END });

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.escalationLevel).toBe(1);

    const overdue = await prisma.notificationLog.findMany({
      where: { type: "OVERDUE", entityId: task.id },
    });
    // Sahip + departman başkanı (yönetici) → 2 alıcı.
    expect(overdue.map((n) => n.userId).sort()).toEqual([seed.ownerId, seed.managerId].sort());
  });

  it("vadesi geçen karşı önlem → OVERDUE_FOLLOWUP görevi + CM_OVERDUE bildirimi", async () => {
    const seed = await seedGovernance(prisma);
    const cm = await prisma.countermeasure.create({
      data: {
        kpiId: seed.kpiId,
        problemStatement: "Sapma",
        status: "OPEN",
        dueDate: new Date(Date.UTC(2020, 0, 1)),
        ownerUserId: seed.ownerId,
      },
    });

    await runDailySweep({ now: JUNE_END });

    const followup = await prisma.task.findFirstOrThrow({
      where: { type: "OVERDUE_FOLLOWUP", countermeasureId: cm.id },
    });
    expect(followup).toMatchObject({ escalationLevel: 1, assigneeId: seed.ownerId });
    const notifs = await prisma.notificationLog.findMany({ where: { type: "CM_OVERDUE" } });
    expect(notifs.map((n) => n.userId).sort()).toEqual([seed.ownerId, seed.managerId].sort());
  });

  it("vadesi yaklaşan (T-3g) açık karşı önlem → yalnız DUE_SOON bildirimi, görev yok", async () => {
    const seed = await seedGovernance(prisma);
    const soon = new Date(JUNE_END.getTime() + 24 * 60 * 60 * 1000); // +1 gün
    await prisma.countermeasure.create({
      data: {
        kpiId: seed.kpiId,
        problemStatement: "Yaklaşan",
        status: "OPEN",
        dueDate: soon,
        ownerUserId: seed.ownerId,
      },
    });

    await runDailySweep({ now: JUNE_END });

    const dueSoon = await prisma.notificationLog.findMany({ where: { type: "DUE_SOON" } });
    expect(dueSoon).toHaveLength(1);
    expect(dueSoon[0].userId).toBe(seed.ownerId);
    expect(await prisma.task.count({ where: { type: "OVERDUE_FOLLOWUP" } })).toBe(0);
  });

  it("geçersiz raporlama sıklığı bir KPI'yı düşürür ama diğerlerini etkilemez (INV-7)", async () => {
    const good = await seedGovernance(prisma);
    const bad = await prisma.kPI.create({
      data: {
        name: "Bozuk KPI",
        unit: "%",
        targetYear: 100,
        reportingFrequency: "WEEKLY", // geçersiz → parseFrequency fırlatır
        ownerUserId: good.ownerId,
        responsibleDeptId: good.deptId,
      },
    });

    const summary = await runDailySweep({ now: JAN });

    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].entity).toBe(`KPI:${bad.id}`);
    // Sağlam KPI yine de işlenmiş olmalı.
    expect(await prisma.task.count({ where: { type: "PERIOD_ENTRY", kpiId: good.kpiId } })).toBe(1);
  });
});
