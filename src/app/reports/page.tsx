import prisma from "@/lib/prisma";
import { ReportClient } from "./ReportClient";
import { FileText } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  // 1. Genel KPI Sağlığı
  const kpis = await prisma.kPI.findMany({
    include: {
      periodRecords: {
        orderBy: { periodStart: 'desc' },
        take: 1
      }
    }
  });

  let redCount = 0; let amberCount = 0; let greenCount = 0;
  const criticalKpis: any[] = [];

  kpis.forEach(kpi => {
    const lastRecord = kpi.periodRecords[0];
    if (lastRecord) {
      if (lastRecord.statusColor === 'RED') {
        redCount++;
        criticalKpis.push(kpi);
      } else if (lastRecord.statusColor === 'AMBER') {
        amberCount++;
      } else if (lastRecord.statusColor === 'GREEN') {
        greenCount++;
      }
    }
  });

  // 2. En Kritik 5 KPI ve Kök Nedenleri (A3 verileri)
  const topCriticalKpis = await prisma.kPI.findMany({
    where: {
      id: { in: criticalKpis.map(k => k.id) }
    },
    include: {
      periodRecords: { orderBy: { periodStart: 'desc' }, take: 1 },
      countermeasures: {
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { ownerUser: true }
      }
    },
    take: 5
  });

  // 3. Stratejik İlerleme (Hoshin'ler)
  const hoshins = await prisma.hoshin.findMany({
    include: {
      majorTasks: {
        include: {
          actionPlans: true
        }
      }
    }
  });

  const hoshinProgress = hoshins.map(h => {
    const allActions = h.majorTasks.flatMap(mt => mt.actionPlans);
    const totalProg = allActions.reduce((sum, act) => sum + act.progressPercent, 0);
    const avgProg = allActions.length > 0 ? Math.round(totalProg / allActions.length) : 0;
    return { name: h.title, progress: avgProg };
  });

  // 4. Son Alınan Önemli Kararlar
  const recentDecisions = await prisma.decision.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      review: true,
      assignee: { include: { department: true } },
      kpi: true
    }
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
            Aylık İcra Kurulu ve üst yönetim değerlendirmeleri için otomatik olarak hazırlanan tek sayfalık A4 özet raporu.
          </p>
        </div>
      </div>

      {/* Yazdırılabilir Alan */}
      <ReportClient 
        stats={{ green: greenCount, amber: amberCount, red: redCount }}
        hoshinProgress={hoshinProgress}
        topCriticalKpis={topCriticalKpis}
        recentDecisions={recentDecisions}
      />
    </div>
  );
}
