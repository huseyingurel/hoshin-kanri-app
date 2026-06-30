import type { PrismaClient } from "@prisma/client";

/**
 * Yönetişim testleri için asgari, gerçekçi bir hiyerarşi:
 *   Departman → (sahip, yönetici/dept-head, sponsor, PMO kullanıcıları)
 *   Hoshin → MajorTask → ActionPlan → KPI
 * Döndürülen kimlikler testlerde varlık referansı olarak kullanılır.
 */
export interface GovernanceSeed {
  deptId: string;
  ownerId: string;
  managerId: string;
  sponsorId: string;
  pmoId: string;
  hoshinId: string;
  majorTaskId: string;
  actionPlanId: string;
  kpiId: string;
}

export async function seedGovernance(prisma: PrismaClient): Promise<GovernanceSeed> {
  const dept = await prisma.department.create({ data: { name: "Üretim" } });

  const owner = await prisma.user.create({
    data: { name: "Sahip", email: "owner@test.local", role: "KPI_OWNER", departmentId: dept.id },
  });
  const manager = await prisma.user.create({
    data: {
      name: "Yönetici",
      email: "manager@test.local",
      role: "DEPT_HEAD",
      departmentId: dept.id,
    },
  });
  const sponsor = await prisma.user.create({
    data: { name: "Sponsor", email: "sponsor@test.local", role: "EXECUTIVE" },
  });
  const pmo = await prisma.user.create({
    data: { name: "PMO", email: "pmo@test.local", role: "PMO" },
  });

  // Departman başkanını ata (dept-head kapsam testleri için).
  await prisma.department.update({ where: { id: dept.id }, data: { headId: manager.id } });

  const hoshin = await prisma.hoshin.create({
    data: { title: "2026 Stratejisi", year: 2026, type: "ANNUAL", sponsorUserId: sponsor.id },
  });
  const majorTask = await prisma.majorTask.create({
    data: { title: "Ana Hedef", hoshinId: hoshin.id },
  });
  const actionPlan = await prisma.actionPlan.create({
    data: {
      title: "Aksiyon Planı",
      majorTaskId: majorTask.id,
      ownerUserId: owner.id,
      responsibleDeptId: dept.id,
    },
  });
  const kpi = await prisma.kPI.create({
    data: {
      name: "Üretim Verimliliği",
      unit: "%",
      targetYear: 100,
      reportingFrequency: "MONTHLY",
      actionPlanId: actionPlan.id,
      ownerUserId: owner.id,
      responsibleDeptId: dept.id,
    },
  });

  return {
    deptId: dept.id,
    ownerId: owner.id,
    managerId: manager.id,
    sponsorId: sponsor.id,
    pmoId: pmo.id,
    hoshinId: hoshin.id,
    majorTaskId: majorTask.id,
    actionPlanId: actionPlan.id,
    kpiId: kpi.id,
  };
}
