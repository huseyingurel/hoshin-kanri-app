import prisma from "@/lib/prisma";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // 1. Hoshin'leri, bağlı MajorTask ve ActionPlan'lerle birlikte çek
  const hoshins = await prisma.hoshin.findMany({
    include: {
      majorTasks: {
        include: {
          actionPlans: true
        }
      }
    }
  });

  // Hoshin ilerleme hesaplaması
  const hoshinProgressData = hoshins.map(hoshin => {
    const allActions = hoshin.majorTasks.flatMap(mt => mt.actionPlans);
    const totalProgress = allActions.reduce((sum, action) => sum + action.progressPercent, 0);
    const avgProgress = allActions.length > 0 ? Math.round(totalProgress / allActions.length) : 0;
    
    return {
      name: hoshin.title.length > 20 ? hoshin.title.substring(0, 20) + "..." : hoshin.title,
      progress: avgProgress,
      tasksCount: allActions.length
    };
  });

  // 2. KPI verilerini çek
  const kpis = await prisma.kPI.findMany({
    include: {
      periodRecords: {
        orderBy: { periodStart: 'desc' },
        take: 1
      }
    }
  });

  let redCount = 0;
  let amberCount = 0;
  let greenCount = 0;
  let unrecordedCount = 0;

  const kpiAlerts: any[] = [];

  kpis.forEach(kpi => {
    const lastRecord = kpi.periodRecords[0];
    if (!lastRecord) {
      unrecordedCount++;
    } else {
      if (lastRecord.statusColor === 'RED') {
        redCount++;
        kpiAlerts.push({ id: kpi.id, name: kpi.name, value: lastRecord.actualValue, target: kpi.targetYear, unit: kpi.unit });
      } else if (lastRecord.statusColor === 'AMBER') {
        amberCount++;
      } else {
        greenCount++;
      }
    }
  });

  const kpiDistribution = [
    { name: 'Hedefte (Yeşil)', value: greenCount, color: '#10b981' }, // emerald-500
    { name: 'Riskli (Sarı)', value: amberCount, color: '#f59e0b' },   // amber-500
    { name: 'Sapan (Kırmızı)', value: redCount, color: '#f43f5e' },    // rose-500
    { name: 'Veri Yok', value: unrecordedCount, color: '#52525b' }     // zinc-600
  ].filter(item => item.value > 0);

  // 3. Açık Karşı Önlemler
  const countermeasures = await prisma.countermeasure.findMany({
    where: { status: 'OPEN' },
    include: { kpi: true },
    orderBy: { createdAt: 'desc' }
  });

  // 4. Son Yönetim Kararları
  const recentDecisions = await prisma.decision.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      review: true,
      assignee: true
    }
  });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
        <p className="text-zinc-400 mt-2">Hoshin Kanri Stratejik Performans ve Kontrol Merkezi</p>
      </div>

      <DashboardClient 
        hoshinProgressData={hoshinProgressData}
        kpiDistribution={kpiDistribution}
        kpiAlerts={kpiAlerts}
        countermeasures={countermeasures}
        recentDecisions={recentDecisions}
        summaryCounts={{
          totalHoshins: hoshins.length,
          greenKpis: greenCount,
          redKpis: redCount,
          openCountermeasures: countermeasures.length
        }}
      />
    </div>
  );
}
