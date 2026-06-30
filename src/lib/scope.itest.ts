import { describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import {
  notificationScopeFilter,
  taskScopeFilter,
  type UserScope,
} from "@/lib/dataScope";
import { seedGovernance } from "../../test/fixtures/seedGovernance";

const scopeOf = (id: string, role: string, departmentId: string | null): UserScope => ({
  id,
  role,
  departmentId,
});

describe("taskScopeFilter / notificationScopeFilter (entegrasyon, INV-4)", () => {
  it("departman kapsamlı kullanıcı yalnız kendi + departman görevlerini görür; kurum geneli hepsini", async () => {
    const seed = await seedGovernance(prisma);

    // A: sahibe + departmana atanmış; B: yöneticiye + departmana; C: departmansız sponsora.
    await prisma.task.create({
      data: { type: "RED_KPI_REVIEW", title: "A", assigneeId: seed.ownerId, assigneeDeptId: seed.deptId },
    });
    await prisma.task.create({
      data: { type: "OVERDUE_FOLLOWUP", title: "B", assigneeId: seed.managerId, assigneeDeptId: seed.deptId },
    });
    await prisma.task.create({
      data: { type: "DECISION_FOLLOWUP", title: "C", assigneeId: seed.sponsorId },
    });

    const owner = scopeOf(seed.ownerId, "KPI_OWNER", seed.deptId);
    const ownerWhere = taskScopeFilter(owner);
    expect(ownerWhere).toBeDefined();
    const ownerTasks = await prisma.task.findMany({ where: ownerWhere });
    // Departman etiketli A + B görünür; departmansız C görünmez.
    expect(ownerTasks.map((t) => t.title).sort()).toEqual(["A", "B"]);

    // Kurum geneli (PMO) → filtre yok → hepsi.
    const pmo = scopeOf(seed.pmoId, "PMO", null);
    expect(taskScopeFilter(pmo)).toBeUndefined();
    const allTasks = await prisma.task.findMany({ where: taskScopeFilter(pmo) });
    expect(allTasks).toHaveLength(3);
  });

  it("departmansız departman-kapsamlı kullanıcı yalnız kendine atanmışı görür", async () => {
    const seed = await seedGovernance(prisma);
    await prisma.task.create({
      data: { type: "PERIOD_ENTRY", title: "kendi", assigneeId: seed.ownerId, assigneeDeptId: seed.deptId },
    });

    // departmanı olmayan USER: yalnız assigneeId === kendisi.
    const lone = scopeOf("baska-kullanici", "USER", null);
    const where = taskScopeFilter(lone);
    const tasks = await prisma.task.findMany({ where });
    expect(tasks).toHaveLength(0);
  });

  it("bildirim kapsamı her zaman kişiseldir — kurum geneli roller bile genişletmez", async () => {
    const seed = await seedGovernance(prisma);
    await prisma.notificationLog.create({
      data: { userId: seed.ownerId, type: "KPI_RED", title: "sahip" },
    });
    await prisma.notificationLog.create({
      data: { userId: seed.pmoId, type: "STRATEGIC_ESCALATION", title: "pmo" },
    });

    const ownerOwn = await prisma.notificationLog.findMany({
      where: notificationScopeFilter(scopeOf(seed.ownerId, "KPI_OWNER", seed.deptId)),
    });
    expect(ownerOwn).toHaveLength(1);
    expect(ownerOwn[0].userId).toBe(seed.ownerId);

    // PMO kurum geneli ama bildirimde yalnız kendi satırını görür (INV-4: daraltma korunur).
    const pmoOwn = await prisma.notificationLog.findMany({
      where: notificationScopeFilter(scopeOf(seed.pmoId, "PMO", null)),
    });
    expect(pmoOwn).toHaveLength(1);
    expect(pmoOwn[0].userId).toBe(seed.pmoId);
  });
});
