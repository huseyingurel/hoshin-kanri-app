import prisma from "@/lib/prisma";
import { DashboardClient } from "@/components/DashboardClient";
import { getSessionOrRedirect } from "@/lib/session";
import { isOrgWideRole } from "@/lib/access";
import {
  countermeasureOpenScopeFilter,
  hoshinScopeFilter,
  kpiScopeFilter,
  type UserScope,
} from "@/lib/dataScope";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) redirect("/login");

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };

  const orgWide = isOrgWideRole(session.role);
  const hWhere = hoshinScopeFilter(scope);
  const kWhere = kpiScopeFilter(scope);
  const cmWhere = countermeasureOpenScopeFilter(scope);

  const hoshins = await prisma.hoshin.findMany({
    ...(hWhere ? { where: hWhere } : {}),
    include: {
      majorTasks: {
        include: {
          actionPlans: true,
        },
      },
    },
  });

  const hoshinProgressData = hoshins.map((hoshin) => {
    const allActions = hoshin.majorTasks.flatMap((mt) => mt.actionPlans);
    const totalProgress = allActions.reduce((sum, action) => sum + action.progressPercent, 0);
    const avgProgress = allActions.length > 0 ? Math.round(totalProgress / allActions.length) : 0;

    return {
      name: hoshin.title.length > 20 ? hoshin.title.substring(0, 20) + "..." : hoshin.title,
      progress: avgProgress,
      tasksCount: allActions.length,
    };
  });

  const kpis = await prisma.kPI.findMany({
    ...(kWhere ? { where: kWhere } : {}),
    include: {
      periodRecords: {
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
  });

  let redCount = 0;
  let amberCount = 0;
  let greenCount = 0;
  let unrecordedCount = 0;

  const kpiAlerts: { id: string; name: string; value: number | null; target: number; unit: string }[] = [];

  kpis.forEach((kpi) => {
    const lastRecord = kpi.periodRecords[0];
    if (!lastRecord) {
      unrecordedCount++;
    } else {
      if (lastRecord.statusColor === "RED") {
        redCount++;
        kpiAlerts.push({
          id: kpi.id,
          name: kpi.name,
          value: lastRecord.actualValue,
          target: kpi.targetYear,
          unit: kpi.unit,
        });
      } else if (lastRecord.statusColor === "AMBER") {
        amberCount++;
      } else {
        greenCount++;
      }
    }
  });

  const kpiDistribution = [
    { name: "Hedefte (Yeşil)", value: greenCount, color: "#10b981" },
    { name: "Riskli (Sarı)", value: amberCount, color: "#f59e0b" },
    { name: "Sapan (Kırmızı)", value: redCount, color: "#f43f5e" },
    { name: "Veri Yok", value: unrecordedCount, color: "#52525b" },
  ].filter((item) => item.value > 0);

  const countermeasures = await prisma.countermeasure.findMany({
    where: cmWhere,
    include: { kpi: true },
    orderBy: { createdAt: "desc" },
  });

  const recentDecisions = await prisma.decision.findMany({
    ...(orgWide ? {} : { where: { assigneeId: session.userId } }),
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      review: true,
      assignee: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {orgWide ? "Executive Dashboard" : "Çalışma Özetim"}
        </h1>
        <p className="text-zinc-400 mt-2">
          {orgWide
            ? "Hoshin Kanri Stratejik Performans ve Kontrol Merkezi"
            : "Yalnızca size atanmış görevler, KPI sorumluluğunuz ve ilgili kararlar için özet."}
        </p>
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
          openCountermeasures: countermeasures.length,
        }}
      />
    </div>
  );
}
