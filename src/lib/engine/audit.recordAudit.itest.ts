import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { recordAudit } from "@/lib/engine/audit";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

describe("recordAudit (entegrasyon)", () => {
  let log: ReturnType<typeof captureLogEvents> | null = null;
  afterEach(() => {
    log?.restore();
    log = null;
  });

  it("tx içinde değişiklik diff'iyle bir AuditLog yazar ve audit.recorded loglar", async () => {
    const seed = await seedGovernance(prisma);
    log = captureLogEvents();

    const row = await prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorUserId: seed.ownerId,
        action: "UPDATE",
        entityType: "KPI",
        entityId: seed.kpiId,
        changes: [{ field: "name", old: "Eski", new: "Yeni" }],
        summary: "KPI adı güncellendi",
        context: "test",
      }),
    );

    const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.action).toBe("UPDATE");
    expect(stored.entityType).toBe("KPI");
    expect(stored.entityId).toBe(seed.kpiId);
    expect(stored.actorUserId).toBe(seed.ownerId);
    expect(stored.changes).toEqual([{ field: "name", old: "Eski", new: "Yeni" }]);

    const events = log.byEvent("audit.recorded");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "UPDATE", entityType: "KPI", context: "test" });
  });

  it("actorUserId null = SYSTEM aktörü olarak saklanır", async () => {
    const seed = await seedGovernance(prisma);
    const row = await prisma.$transaction((tx) =>
      recordAudit(tx, {
        action: "ESCALATE",
        entityType: "KPI",
        entityId: seed.kpiId,
        summary: "Sistem eskalasyonu",
        context: "sweep",
      }),
    );
    const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.actorUserId).toBeNull();
    // changes verilmedi → JSON sütunu null.
    expect(stored.changes).toBeNull();
  });

  it("INV-1: dış işlem fırlatırsa audit yazımı geri alınır", async () => {
    const seed = await seedGovernance(prisma);

    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit(tx, {
          action: "UPDATE",
          entityType: "KPI",
          entityId: seed.kpiId,
          summary: "yarıda kalacak",
          context: "test",
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await prisma.auditLog.count()).toBe(0);
  });
});
