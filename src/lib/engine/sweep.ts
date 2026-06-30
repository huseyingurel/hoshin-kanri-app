/**
 * Günlük tarama (sweep) — zaman tetikli yönetişim motoru.
 *
 * Harici cron `POST /api/cron/sweep` ile çağrılır (bkz. route). Saf değildir: veritabanı
 * okur/yazar. Determinizm için `now` daima dışarıdan verilebilir (test). Her iş birimi
 * **kendi `$transaction`'ında** çalışır ve kendi `try/catch`'i vardır: bir kalemin hatası
 * diğerlerini düşürmez; hata `summary.failures`'a yazılır (INV-7 — sessiz yutma yok).
 *
 * İdempotans: tüm görev/bildirim yazımları motor yazıcılarının dedupeKey'lerine dayanır
 * (INV-2/INV-3), bu yüzden taramayı günde birden çok kez çalıştırmak güvenlidir.
 */

import prisma from "@/lib/prisma";
import { recordAudit } from "@/lib/engine/audit";
import { upsertSystemTask } from "@/lib/engine/tasks";
import { notify } from "@/lib/engine/notifications";
import { computeEscalationLevel } from "@/lib/engine/escalation";
import {
  countLeadingConsecutiveRed,
  duePeriodsAsOf,
  parseFrequency,
  periodKeyFor,
} from "@/lib/engine/calendar";
import type { NotificationType } from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

/** Vade yaklaşımı penceresi: now < dueDate ≤ now + DUE_SOON_DAYS gün. */
export const DUE_SOON_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepFailure {
  /** Hangi kalem başarısız oldu, ör. "KPI:period:abc" / "Countermeasure:def". */
  entity: string;
  error: string;
}

export interface SweepSummary {
  ranAt: string;
  /** İncelenen kalem (KPI + açık görev/CM/karar) sayısı. */
  scanned: number;
  /** Yeni oluşturulan görev sayısı. */
  generated: number;
  /** Yeni yazılan bildirim sayısı. */
  notified: number;
  /** Seviye 2 stratejik eskalasyon sayısı. */
  escalated: number;
  /** İdempotans nedeniyle atlanan (zaten var olan) görev/bildirim sayısı. */
  skipped: number;
  failures: SweepFailure[];
}

/** Mutasyon sırasında biriken sayaçlar (tek bir tarama çalışması için). */
interface Counters {
  generated: number;
  notified: number;
  escalated: number;
  skipped: number;
}

function tallyTask(c: Counters, created: boolean): void {
  if (created) c.generated++;
  else c.skipped++;
}

function tallyNotify(c: Counters, created: boolean): void {
  if (created) c.notified++;
  else c.skipped++;
}

/** Bir kullanıcının yöneticisi = departman başkanı (kendisi değilse). */
type WithManager = {
  id: string;
  department: { headId: string | null } | null;
} | null;

function managerIdOf(user: WithManager): string | null {
  const headId = user?.department?.headId ?? null;
  if (!headId || !user || headId === user.id) return null;
  return headId;
}

/** null/yinelenen alıcıları eler. */
function dedupeIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const id of ids) if (id) seen.add(id);
  return [...seen];
}

export async function runDailySweep({ now = new Date() }: { now?: Date } = {}): Promise<SweepSummary> {
  logEvent("info", "sweep.started", { now: now.toISOString() });

  const counters: Counters = { generated: 0, notified: 0, escalated: 0, skipped: 0 };
  const failures: SweepFailure[] = [];
  let scanned = 0;

  // --- 1 & 2: KPI başına dönem-açılışı + RED takibi --------------------------------
  const kpis = await prisma.kPI.findMany({
    select: {
      id: true,
      name: true,
      reportingFrequency: true,
      ownerUserId: true,
      responsibleDeptId: true,
      actionPlan: {
        select: {
          majorTask: { select: { hoshin: { select: { sponsorUserId: true, year: true } } } },
        },
      },
      periodRecords: {
        orderBy: { periodStart: "desc" },
        select: { periodStart: true, statusColor: true },
      },
    },
  });
  scanned += kpis.length;

  for (const kpi of kpis) {
    let frequency;
    try {
      frequency = parseFrequency(kpi.reportingFrequency);
    } catch (e) {
      failures.push({ entity: `KPI:${kpi.id}`, error: errMsg(e) });
      continue; // sıklık geçersizse bu KPI'yı atla
    }

    // 2: kaydı olmayan açık dönemler için PERIOD_ENTRY görevi + PERIOD_OPENED bildirimi.
    // Mali yıl, KPI'nın bağlı olduğu Hoshin'in yılıdır (yoksa içinde bulunulan yıl).
    try {
      const fiscalYear = kpi.actionPlan?.majorTask?.hoshin?.year ?? now.getUTCFullYear();
      const due = duePeriodsAsOf(now, frequency, fiscalYear);
      const haveKeys = new Set(kpi.periodRecords.map((r) => periodKeyFor(r.periodStart, frequency)));
      const missing = due.filter((k) => !haveKeys.has(k));

      if (missing.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const periodKey of missing) {
            const { created } = await upsertSystemTask(tx, {
              type: "PERIOD_ENTRY",
              entityType: "KPI",
              entityId: kpi.id,
              periodKey,
              title: `Dönem girişi bekleniyor: ${kpi.name} (${periodKey})`,
              priority: "MEDIUM",
              assigneeId: kpi.ownerUserId,
              assigneeDeptId: kpi.responsibleDeptId,
              links: { kpiId: kpi.id },
            });
            tallyTask(counters, created);

            if (kpi.ownerUserId) {
              const n = await notify(tx, {
                userId: kpi.ownerUserId,
                type: "PERIOD_OPENED",
                title: `Yeni dönem açıldı: ${kpi.name}`,
                body: `${periodKey} dönemi için KPI girişi bekleniyor.`,
                entityType: "KPI",
                entityId: kpi.id,
                periodKey,
              });
              tallyNotify(counters, n.created);
            }
          }
        });
      }
    } catch (e) {
      failures.push({ entity: `KPI:period:${kpi.id}`, error: errMsg(e) });
    }

    // 3: en son kayıt RED ise inceleme görevi + KPI_RED; 2 ardışık RED → seviye 2 eskalasyon.
    try {
      const latest = kpi.periodRecords[0];
      if (latest?.statusColor === "RED") {
        const periodKey = periodKeyFor(latest.periodStart, frequency);
        const consecutiveRed = countLeadingConsecutiveRed(kpi.periodRecords, frequency);
        const level = computeEscalationLevel({ daysOverdue: 0, consecutiveRed });

        await prisma.$transaction(async (tx) => {
          const { created } = await upsertSystemTask(tx, {
            type: "RED_KPI_REVIEW",
            entityType: "KPI",
            entityId: kpi.id,
            periodKey,
            title: `RED KPI incelemesi: ${kpi.name}`,
            priority: "HIGH",
            escalationLevel: level,
            assigneeId: kpi.ownerUserId,
            assigneeDeptId: kpi.responsibleDeptId,
            links: { kpiId: kpi.id },
          });
          tallyTask(counters, created);

          if (kpi.ownerUserId) {
            const n = await notify(tx, {
              userId: kpi.ownerUserId,
              type: "KPI_RED",
              title: `KPI kırmızı: ${kpi.name}`,
              entityType: "KPI",
              entityId: kpi.id,
              periodKey,
            });
            tallyNotify(counters, n.created);
          }

          if (level === 2) {
            const sponsorId = kpi.actionPlan?.majorTask?.hoshin?.sponsorUserId ?? null;
            const pmoUsers = await tx.user.findMany({ where: { role: "PMO" }, select: { id: true } });
            const recipients = dedupeIds([sponsorId, ...pmoUsers.map((u) => u.id)]);
            for (const userId of recipients) {
              const n = await notify(tx, {
                userId,
                type: "STRATEGIC_ESCALATION",
                title: `Stratejik eskalasyon: ${kpi.name}`,
                body: `${consecutiveRed} ardışık dönem RED.`,
                entityType: "KPI",
                entityId: kpi.id,
                periodKey,
              });
              tallyNotify(counters, n.created);
            }
            await recordAudit(tx, {
              actorUserId: null, // SYSTEM (cron)
              action: "ESCALATE",
              entityType: "KPI",
              entityId: kpi.id,
              changes: [{ field: "escalationLevel", old: null, new: 2 }],
              summary: `KPI ${consecutiveRed} ardışık RED → seviye 2 stratejik eskalasyon`,
              context: "sweep",
            });
            counters.escalated++;
            logEvent("info", "escalation.raised", {
              kpiId: kpi.id,
              level: 2,
              consecutiveRed,
              context: "sweep",
            });
          }
        });
      }
    } catch (e) {
      failures.push({ entity: `KPI:red:${kpi.id}`, error: errMsg(e) });
    }
  }

  // --- 4: açık görev/CM/karar için vade-yaklaşımı (DUE_SOON) ve gecikme (OVERDUE) ----
  const soonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  const openStatuses = { in: ["OPEN", "IN_PROGRESS"] };

  // 4a: mevcut açık görevler
  const dueTasks = await prisma.task.findMany({
    where: { status: openStatuses, dueDate: { not: null } },
    select: {
      id: true,
      dueDate: true,
      escalationLevel: true,
      kpiId: true,
      assigneeId: true,
      assignee: { select: { id: true, department: { select: { headId: true } } } },
    },
  });
  scanned += dueTasks.length;

  for (const task of dueTasks) {
    const dueDate = task.dueDate;
    if (!dueDate) continue;
    try {
      if (dueDate < now) {
        // Gecikti: görevi seviye 1'e yükselt + atanan ve yöneticisine OVERDUE bildirimi.
        const recipients = dedupeIds([task.assigneeId, managerIdOf(task.assignee)]);
        await prisma.$transaction(async (tx) => {
          if (task.escalationLevel < 1) {
            await tx.task.update({ where: { id: task.id }, data: { escalationLevel: 1 } });
          }
          await notifyEach(tx, counters, recipients, {
            type: "OVERDUE",
            title: "Vadesi geçen görev",
            entityType: "Task",
            entityId: task.id,
          });
        });
      } else if (dueDate <= soonCutoff && task.assigneeId) {
        await prisma.$transaction(async (tx) => {
          const n = await notify(tx, {
            userId: task.assigneeId!,
            type: "DUE_SOON",
            title: "Görev vadesi yaklaşıyor",
            entityType: "Task",
            entityId: task.id,
          });
          tallyNotify(counters, n.created);
        });
      }
    } catch (e) {
      failures.push({ entity: `Task:${task.id}`, error: errMsg(e) });
    }
  }

  // 4b: açık karşı önlemler (dueDate'i olanlar)
  const dueCms = await prisma.countermeasure.findMany({
    where: { status: openStatuses, dueDate: { not: null } },
    select: {
      id: true,
      dueDate: true,
      kpiId: true,
      ownerUserId: true,
      ownerUser: { select: { id: true, department: { select: { headId: true } } } },
    },
  });
  scanned += dueCms.length;

  for (const cm of dueCms) {
    const dueDate = cm.dueDate;
    if (!dueDate) continue;
    try {
      if (dueDate < now) {
        const recipients = dedupeIds([cm.ownerUserId, managerIdOf(cm.ownerUser)]);
        await prisma.$transaction(async (tx) => {
          const { created } = await upsertSystemTask(tx, {
            type: "OVERDUE_FOLLOWUP",
            entityType: "Countermeasure",
            entityId: cm.id,
            title: "Vadesi geçen karşı önlem takibi",
            priority: "HIGH",
            escalationLevel: 1,
            assigneeId: cm.ownerUserId,
            links: { countermeasureId: cm.id, kpiId: cm.kpiId },
          });
          tallyTask(counters, created);
          await notifyEach(tx, counters, recipients, {
            type: "CM_OVERDUE",
            title: "Vadesi geçen karşı önlem",
            entityType: "Countermeasure",
            entityId: cm.id,
          });
        });
      } else if (dueDate <= soonCutoff && cm.ownerUserId) {
        await prisma.$transaction(async (tx) => {
          const n = await notify(tx, {
            userId: cm.ownerUserId!,
            type: "DUE_SOON",
            title: "Karşı önlem vadesi yaklaşıyor",
            entityType: "Countermeasure",
            entityId: cm.id,
          });
          tallyNotify(counters, n.created);
        });
      }
    } catch (e) {
      failures.push({ entity: `Countermeasure:${cm.id}`, error: errMsg(e) });
    }
  }

  // 4c: açık kararlar (dueDate'i olanlar)
  const dueDecisions = await prisma.decision.findMany({
    where: { status: openStatuses, dueDate: { not: null } },
    select: {
      id: true,
      dueDate: true,
      kpiId: true,
      actionPlanId: true,
      assigneeId: true,
      assignee: { select: { id: true, department: { select: { headId: true } } } },
    },
  });
  scanned += dueDecisions.length;

  for (const d of dueDecisions) {
    const dueDate = d.dueDate;
    if (!dueDate) continue;
    try {
      if (dueDate < now) {
        const recipients = dedupeIds([d.assigneeId, managerIdOf(d.assignee)]);
        await prisma.$transaction(async (tx) => {
          const { created } = await upsertSystemTask(tx, {
            type: "OVERDUE_FOLLOWUP",
            entityType: "Decision",
            entityId: d.id,
            title: "Vadesi geçen karar takibi",
            priority: "HIGH",
            escalationLevel: 1,
            assigneeId: d.assigneeId,
            links: { decisionId: d.id, kpiId: d.kpiId, actionPlanId: d.actionPlanId },
          });
          tallyTask(counters, created);
          await notifyEach(tx, counters, recipients, {
            type: "OVERDUE",
            title: "Vadesi geçen karar",
            entityType: "Decision",
            entityId: d.id,
          });
        });
      } else if (dueDate <= soonCutoff && d.assigneeId) {
        await prisma.$transaction(async (tx) => {
          const n = await notify(tx, {
            userId: d.assigneeId!,
            type: "DUE_SOON",
            title: "Karar vadesi yaklaşıyor",
            entityType: "Decision",
            entityId: d.id,
          });
          tallyNotify(counters, n.created);
        });
      }
    } catch (e) {
      failures.push({ entity: `Decision:${d.id}`, error: errMsg(e) });
    }
  }

  const summary: SweepSummary = {
    ranAt: now.toISOString(),
    scanned,
    generated: counters.generated,
    notified: counters.notified,
    escalated: counters.escalated,
    skipped: counters.skipped,
    failures,
  };
  logEvent("info", "sweep.completed", { ...summary, failures: failures.length });
  return summary;
}

/** Aynı yükü birden çok alıcıya (idempotan) yazar; sayaçları günceller. */
async function notifyEach(
  tx: Parameters<typeof notify>[0],
  counters: Counters,
  recipients: readonly string[],
  payload: { type: NotificationType; title: string; entityType: string; entityId: string },
): Promise<void> {
  for (const userId of recipients) {
    const n = await notify(tx, { userId, ...payload });
    tallyNotify(counters, n.created);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
