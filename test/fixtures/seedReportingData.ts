import type { PrismaClient } from "@prisma/client";
import { seedGovernance, type GovernanceSeed } from "./seedGovernance";

/**
 * `seedGovernance` üzerine çok-yıllı rapor/dışa-aktarma verisi:
 *   - 2026 KPI'sine bir RED dönem kaydı (kritik KPI + rapor satırı)
 *   - 2025 yılına ayrı bir Hoshic→KPI zinciri (GREEN) — arşiv/yıl filtresi testleri için
 *   - bir Review + iki Decision (toplantı tutanağı raporu için)
 */
export interface ReportingSeed extends GovernanceSeed {
  kpi2025Id: string;
  hoshin2025Id: string;
  redPeriodId: string;
  reviewId: string;
  decisionOpenId: string;
  decisionClosedId: string;
}

export async function seedReportingData(prisma: PrismaClient): Promise<ReportingSeed> {
  const g = await seedGovernance(prisma);

  // 2026 KPI'sine RED dönem kaydı (sapma hedefin altında).
  const redPeriod = await prisma.kPIPeriodRecord.create({
    data: {
      kpiId: g.kpiId,
      periodStart: new Date(Date.UTC(2026, 4, 1)),
      periodEnd: new Date(Date.UTC(2026, 4, 31)),
      targetValue: 100,
      actualValue: 60,
      variance: -40,
      statusColor: "RED",
      varianceReason: "Hat duruşları arttı",
    },
  });

  // 2025 yılına ayrı zincir (yıl filtresi/arşiv için).
  const hoshin2025 = await prisma.hoshin.create({
    data: { title: "2025 Stratejisi", year: 2025, type: "ANNUAL", sponsorUserId: g.sponsorId },
  });
  const mt2025 = await prisma.majorTask.create({
    data: { title: "2025 Ana Hedef", hoshinId: hoshin2025.id },
  });
  const ap2025 = await prisma.actionPlan.create({
    data: {
      title: "2025 Aksiyon Planı",
      majorTaskId: mt2025.id,
      ownerUserId: g.ownerId,
      responsibleDeptId: g.deptId,
    },
  });
  const kpi2025 = await prisma.kPI.create({
    data: {
      name: "2025 Verimliliği",
      unit: "%",
      targetYear: 100,
      reportingFrequency: "MONTHLY",
      actionPlanId: ap2025.id,
      ownerUserId: g.ownerId,
      responsibleDeptId: g.deptId,
    },
  });
  await prisma.kPIPeriodRecord.create({
    data: {
      kpiId: kpi2025.id,
      periodStart: new Date(Date.UTC(2025, 4, 1)),
      periodEnd: new Date(Date.UTC(2025, 4, 31)),
      targetValue: 100,
      actualValue: 98,
      variance: -2,
      statusColor: "GREEN",
    },
  });

  // Review + kararlar (toplantı tutanağı).
  const review = await prisma.review.create({
    data: {
      title: "Aylık İcra Kurulu",
      type: "MEETING",
      date: new Date(Date.UTC(2026, 5, 1)),
      organizerId: g.pmoId,
    },
  });
  const decisionOpen = await prisma.decision.create({
    data: {
      reviewId: review.id,
      decisionText: "RED KPI için karşı önlem başlatılsın",
      status: "OPEN",
      dueDate: new Date(Date.UTC(2026, 6, 1)),
      kpiId: g.kpiId,
      assigneeId: g.ownerId,
    },
  });
  const decisionClosed = await prisma.decision.create({
    data: {
      reviewId: review.id,
      decisionText: "Bütçe onaylandı",
      status: "CLOSED",
      assigneeId: g.pmoId,
    },
  });

  return {
    ...g,
    kpi2025Id: kpi2025.id,
    hoshin2025Id: hoshin2025.id,
    redPeriodId: redPeriod.id,
    reviewId: review.id,
    decisionOpenId: decisionOpen.id,
    decisionClosedId: decisionClosed.id,
  };
}
