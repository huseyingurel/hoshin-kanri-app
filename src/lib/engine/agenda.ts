/**
 * Toplantı gündem paketi montajı (FR-31/32). Bir inceleme için kategorize edilmiş gündem
 * üretir: RED KPI'lar, açık karşı önlemler, vadesi geçmiş görevler, **karar bekleyenler**
 * (FR-32: vadesi geçmiş veya atanmamış açık kararlar) ve toplam sayımlar.
 *
 * DI: `db` enjekte edilir (PrismaClient) — DB'siz testte sahte istemci verilebilir. Kapsam
 * filtreleri yalnız daraltır (INV-4).
 */

import type { PrismaClient } from "@prisma/client";
import {
  countermeasureOpenScopeFilter,
  kpiScopeFilter,
  taskScopeFilter,
  type UserScope,
} from "@/lib/dataScope";
import { logEvent } from "@/lib/log";

export interface AgendaPackage {
  reviewId: string;
  redKpis: unknown[];
  openCountermeasures: unknown[];
  overdueTasks: unknown[];
  decisionsNeeded: unknown[];
  counts: {
    redKpis: number;
    openCountermeasures: number;
    overdueTasks: number;
    decisionsNeeded: number;
  };
}

export async function assembleAgenda(
  db: PrismaClient,
  reviewId: string,
  scope: UserScope,
  now: Date = new Date(),
): Promise<AgendaPackage> {
  const kWhere = kpiScopeFilter(scope);
  const cmWhere = countermeasureOpenScopeFilter(scope);
  const tWhere = taskScopeFilter(scope);

  const redKpisRaw = await db.kPI.findMany({
    where: {
      AND: [{ periodRecords: { some: { statusColor: "RED" } } }, ...(kWhere ? [kWhere] : [])],
    },
    include: {
      periodRecords: { orderBy: { periodStart: "desc" }, take: 1 },
      responsibleDept: true,
      ownerUser: true,
    },
  });
  const redKpis = redKpisRaw.filter((k) => k.periodRecords[0]?.statusColor === "RED");

  const openCountermeasures = await db.countermeasure.findMany({
    where: cmWhere,
    include: { kpi: true, ownerUser: true },
  });

  const overdueTasks = await db.task.findMany({
    where: {
      AND: [
        { status: { in: ["OPEN", "IN_PROGRESS"] } },
        { dueDate: { lt: now } },
        ...(tWhere ? [tWhere] : []),
      ],
    },
    include: { assignee: true, assigneeDept: true, kpi: true },
    orderBy: { dueDate: "asc" },
  });

  // FR-32: karar bekleyenler — bu incelemenin açık kararlarından vadesi geçmiş VEYA atanmamış.
  const decisionsNeeded = await db.decision.findMany({
    where: {
      reviewId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      OR: [{ dueDate: { lt: now } }, { assigneeId: null }],
    },
    include: { assignee: true, kpi: true },
    orderBy: { createdAt: "asc" },
  });

  const counts = {
    redKpis: redKpis.length,
    openCountermeasures: openCountermeasures.length,
    overdueTasks: overdueTasks.length,
    decisionsNeeded: decisionsNeeded.length,
  };
  logEvent("info", "agenda.assembled", { reviewId, ...counts });

  return { reviewId, redKpis, openCountermeasures, overdueTasks, decisionsNeeded, counts };
}
