import prisma from "@/lib/prisma";
import { ReportClient } from "./ReportClient";
import { FileText } from "lucide-react";
import { getSessionOrRedirect } from "@/lib/session";
import { isOrgWideRole } from "@/lib/access";
import { hoshinScopeFilter, kpiScopeFilter, type UserScope } from "@/lib/dataScope";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
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
  const kWhere = kpiScopeFilter(scope);
  const hWhere = hoshinScopeFilter(scope);

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
  const criticalKpis: typeof kpis = [];

  kpis.forEach((kpi) => {
    const lastRecord = kpi.periodRecords[0];
    if (lastRecord) {
      if (lastRecord.statusColor === "RED") {
        redCount++;
        criticalKpis.push(kpi);
      } else if (lastRecord.statusColor === "AMBER") {
        amberCount++;
      } else if (lastRecord.statusColor === "GREEN") {
        greenCount++;
      }
    }
  });

  const topCriticalKpis = await prisma.kPI.findMany({
    where: {
      id: { in: criticalKpis.map((k) => k.id) },
    },
    include: {
      periodRecords: { orderBy: { periodStart: "desc" }, take: 1 },
      countermeasures: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { ownerUser: true },
      },
    },
    take: 5,
  });

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

  const hoshinProgress = hoshins.map((h) => {
    const allActions = h.majorTasks.flatMap((mt) => mt.actionPlans);
    const totalProg = allActions.reduce((sum, act) => sum + act.progressPercent, 0);
    const avgProg = allActions.length > 0 ? Math.round(totalProg / allActions.length) : 0;
    return { name: h.title, progress: avgProg };
  });

  const decisionWhere = orgWide
    ? { status: "OPEN" as const }
    : { status: "OPEN" as const, assigneeId: session.userId };

  const recentDecisions = await prisma.decision.findMany({
    where: decisionWhere,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      review: true,
      assignee: { include: { department: true } },
      kpi: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto h-full">
      <div className="print-hidden flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
            <FileText className="text-blue-500" />
            Rapor Merkezi (One-Pager)
          </h1>
          <p className="text-zinc-400 mt-2 max-w-3xl">
            {orgWide
              ? "Aylık İcra Kurulu ve üst yönetim değerlendirmeleri için otomatik olarak hazırlanan tek sayfalık A4 özet raporu."
              : "Kurum geneli rolünüz olmadığı için rapor yalnızca size düşen KPI ve kararlar üzerinden üretilir."}
          </p>
        </div>
      </div>

      <ReportClient
        stats={{ green: greenCount, amber: amberCount, red: redCount }}
        hoshinProgress={hoshinProgress}
        topCriticalKpis={topCriticalKpis}
        recentDecisions={recentDecisions}
        reportScope={orgWide ? "org" : "personal"}
      />
    </div>
  );
}
