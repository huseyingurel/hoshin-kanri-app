import { afterEach, describe, expect, it, vi } from "vitest";

// Server action getSession()/revalidatePath() bağımlılıklarını izole et.
const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { userId: h.userId } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { saveKpiRecord } from "@/app/actions/kpiActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

// MONTHLY dönemler: UTC ile sabitlenir (zaman dilimi sapması olmasın).
const MAY = new Date(Date.UTC(2026, 4, 15));
const JUNE = new Date(Date.UTC(2026, 5, 15));

describe("saveKpiRecord (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    h.userId = null;
    log?.restore();
    log = null;
  });

  it("oturum yoksa hata döner, hiçbir şey yazmaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = null;
    const res = await saveKpiRecord(seed.kpiId, 100, 100, MAY, "");
    expect(res).toEqual({ success: false, error: expect.stringMatching(/Oturum/) });
    expect(await prisma.kPIPeriodRecord.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("GREEN: 1 kayıt + 1 CREATE denetimi; görev/karşı önlem/bildirim yok", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId;
    log = captureLogEvents();

    const res = await saveKpiRecord(seed.kpiId, 100, 100, MAY, "iyi gidiyor");
    expect(res).toEqual({ success: true });

    expect(await prisma.kPIPeriodRecord.count()).toBe(1);
    expect(await prisma.countermeasure.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.notificationLog.count()).toBe(0);

    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "CREATE", entityType: "KPIPeriodRecord" });
    expect(log.byEvent("audit.recorded")).toHaveLength(1);
    expect(log.byEvent("task.created")).toHaveLength(0);
  });

  it("RED: kayıt + karşı önlem + RED_KPI_REVIEW görevi + KPI_RED bildirimi tek commit'te", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId;
    log = captureLogEvents();

    const res = await saveKpiRecord(seed.kpiId, 100, 40, MAY, "");
    expect(res).toEqual({ success: true });

    expect(await prisma.kPIPeriodRecord.count()).toBe(1);
    expect(await prisma.countermeasure.count()).toBe(1);

    const tasks = await prisma.task.findMany({ where: { type: "RED_KPI_REVIEW" } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      priority: "HIGH",
      kpiId: seed.kpiId,
      assigneeId: seed.ownerId,
      assigneeDeptId: seed.deptId,
      escalationLevel: 0, // tek RED → eskalasyon yok
    });

    const notifs = await prisma.notificationLog.findMany({ where: { type: "KPI_RED" } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(seed.ownerId);

    // CREATE(KPIPeriodRecord) + CREATE(Countermeasure)
    expect(await prisma.auditLog.count({ where: { action: "CREATE" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "ESCALATE" } })).toBe(0);

    expect(log.byEvent("task.created")).toHaveLength(1);
    expect(log.byEvent("notification.created")).toHaveLength(1);
  });

  it("aynı RED dönem yeniden kaydedilince karşı önlem/görev/bildirim çoğalmaz (idempotans)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId;

    await saveKpiRecord(seed.kpiId, 100, 40, MAY, "");
    await saveKpiRecord(seed.kpiId, 100, 30, MAY, "tekrar");

    expect(await prisma.kPIPeriodRecord.count()).toBe(2); // her giriş yeni kayıt
    expect(await prisma.countermeasure.count()).toBe(1); // açık CM tekrar açılmaz
    expect(await prisma.task.count({ where: { type: "RED_KPI_REVIEW" } })).toBe(1); // dönem başına tek
    expect(await prisma.notificationLog.count({ where: { type: "KPI_RED" } })).toBe(1);
    // İki kayıt da aynı dönem → ardışık RED 1 → eskalasyon yok.
    expect(await prisma.notificationLog.count({ where: { type: "STRATEGIC_ESCALATION" } })).toBe(0);
  });

  it("2 ardışık RED dönem → seviye 2 eskalasyon + STRATEGIC_ESCALATION (sponsor+PMO)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId;
    log = captureLogEvents();

    await saveKpiRecord(seed.kpiId, 100, 40, MAY, "");
    await saveKpiRecord(seed.kpiId, 100, 35, JUNE, "");

    // Sponsor + PMO = 2 alıcı.
    const esc = await prisma.notificationLog.findMany({ where: { type: "STRATEGIC_ESCALATION" } });
    expect(esc).toHaveLength(2);
    expect(esc.map((n) => n.userId).sort()).toEqual([seed.sponsorId, seed.pmoId].sort());

    expect(await prisma.auditLog.count({ where: { action: "ESCALATE" } })).toBe(1);

    // Haziran (2. RED) görevi seviye 2 ile açılmış olmalı.
    const juneTask = await prisma.task.findFirst({
      where: { type: "RED_KPI_REVIEW", periodKey: "2026-M06" },
    });
    expect(juneTask?.escalationLevel).toBe(2);

    expect(log.byEvent("escalation.raised")).toHaveLength(1);
  });
});
