"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { kpiScopeFilter, type UserScope } from "@/lib/dataScope";
import { canManageSettings } from "@/lib/access";
import {
  computeKpiRagFromVariancePercent,
  computePercentVariance,
  resolveThresholds,
  shouldAutoOpenCountermeasure,
} from "@/lib/kpiRag";
import { diff, recordAudit } from "@/lib/engine/audit";
import { computeEscalationLevel } from "@/lib/engine/escalation";
import { countLeadingConsecutiveRed, parseFrequency, periodKeyFor } from "@/lib/engine/calendar";
import { logEvent } from "@/lib/log";
import * as db from "@/lib/db";

export type ActionResult = { success: true } | { success: false; error: string };
export type SaveKpiRecordResult = ActionResult;

/**
 * MIGRATION: this action's data layer runs on the emploid.ai **Collections** service via
 * `@/lib/db`, not Prisma/Postgres. The mechanics were proven live by the 2026-07-09 spike
 * (see the parent repo's `docs/plans/tracer-bullet-productionize.md`). Because Collections
 * has **no multi-record transaction**, the former `prisma.$transaction` block is a
 * best-effort sequence, NOT atomic:
 *  - The countermeasure, task, and notification writes are idempotent (dedup on an open
 *    countermeasure / on their dedupe keys), so re-running is safe for them.
 *  - The period record and its audit row are NOT deduped — a failure *after* they are
 *    written leaves them in place, and a retry appends new ones. This partial-write /
 *    duplicate-on-retry window is the documented tracer tradeoff (the transactional-write
 *    ask in the plan); acceptable at this stage, flagged for a real fix.
 * The pure domain logic (RAG, escalation, calendar, diff) is unchanged, as are all
 * Turkish messages and error semantics. `lockPeriod`/`reopenPeriod` below still use Prisma
 * pending their own adapter swap — so a lock they write to Postgres is not yet visible to
 * the Collections-backed lock check above (a known cross-backend gap during the migration).
 */
export async function saveKpiRecord(
  kpiId: string,
  targetValue: number,
  actualValue: number,
  periodDate: Date,
  ownerComment: string,
  // FR-15: sapma gerekçesi + kanıt bağlantısı (opsiyonel)
  extra?: { varianceReason?: string | null; evidenceUrl?: string | null }
): Promise<SaveKpiRecordResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }

  const dbUser = await db.getUserById(session.userId);
  if (!dbUser) {
    return { success: false, error: "Kullanıcı bulunamadı." };
  }

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const kWhere = kpiScopeFilter(scope);

  // Scope guard: kWhere undefined = org-wide role (no row filter). Otherwise the KPI must be
  // owned by the user or belong to their responsible department (personalKpiScopeFilter).
  if (kWhere) {
    const allowed = await db.findKpiInScope(kpiId, {
      ownerUserId: scope.id,
      departmentId: scope.departmentId,
    });
    if (!allowed) {
      return { success: false, error: "Bu KPI için veri girişi yetkiniz yok." };
    }
  }

  // KPI ayrıntıları: başlık/sahip/departman/sıklık + (eskalasyon için) sponsor zinciri.
  const kpi = await db.getKpiById(kpiId);
  if (!kpi) {
    return { success: false, error: "KPI bulunamadı." };
  }

  const variance = actualValue - targetValue;
  const percentVariance = computePercentVariance(actualValue, targetValue);
  const settings = await db.getRagThresholds();
  // FR-12: KPI'ya özel eşik varsa varsayılanı ezer.
  const thresholds = resolveThresholds(
    { redThreshold: kpi.redThreshold, amberThreshold: kpi.amberThreshold },
    settings,
  );
  const statusColor = computeKpiRagFromVariancePercent(percentVariance, thresholds);

  const periodStart = periodDate;
  const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);

  // INV-6: bu dönemle çakışan kilitli bir kayıt varsa yalnız ADMIN/PMO değiştirebilir.
  const lockedExisting = await db.findLockedOverlappingPeriod(
    kpiId,
    periodStart,
    periodEnd,
  );
  if (lockedExisting && !canManageSettings(dbUser.role)) {
    return {
      success: false,
      error: "Bu dönem kilitli; düzenlemek için ADMIN/PMO yetkisi gerekir.",
    };
  }

  try {
    // No multi-record transaction on Collections: write the period record first, then the
    // idempotent side-effects. See the MIGRATION note above.
    const recordId = await db.createPeriodRecord({
      kpiId,
      periodStart,
      periodEnd,
      targetValue,
      actualValue,
      variance,
      statusColor,
      ownerComment:
        ownerComment || (statusColor !== "GREEN" ? "Sistem: Yorum girilmedi" : ""),
      varianceReason: extra?.varianceReason?.trim() || null,
      evidenceUrl: extra?.evidenceUrl?.trim() || null,
      submittedById: session.userId,
    });

    // INV-1: her mutasyon denetlenir.
    await db.recordAudit({
      actorUserId: session.userId,
      action: "CREATE",
      entityType: "KPIPeriodRecord",
      entityId: recordId,
      changes: diff(
        null,
        { targetValue, actualValue, variance, statusColor },
        ["targetValue", "actualValue", "variance", "statusColor"],
      ),
      summary: `KPI dönem kaydı oluşturuldu (${statusColor})`,
      context: "saveKpiRecord",
    });

    if (shouldAutoOpenCountermeasure(statusColor)) {
      // --- RED yolu: karşı önlem + görev + bildirim + (gerekirse) eskalasyon ---
      const existingCm = await db.findOpenCountermeasure(kpiId);
      if (!existingCm) {
        const cmId = await db.createCountermeasure({
          kpiId,
          problemStatement: `${periodDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} Dönemi Sapması: Hedeflenen ${targetValue}, gerçekleşen ${actualValue}.`,
        });
        await db.recordAudit({
          actorUserId: session.userId,
          action: "CREATE",
          entityType: "Countermeasure",
          entityId: cmId,
          summary: "RED KPI için karşı önlem otomatik açıldı",
          context: "saveKpiRecord",
        });
      }

      const frequency = parseFrequency(kpi.reportingFrequency ?? "");
      const periodKey = periodKeyFor(periodStart, frequency);

      // Ardışık RED'i (yeni kayıt dahil) hesapla → eskalasyon seviyesi.
      const recent = await db.listPeriodRecords(kpiId);
      const consecutiveRed = countLeadingConsecutiveRed(recent, frequency);
      const level = computeEscalationLevel({ daysOverdue: 0, consecutiveRed });

      await db.upsertSystemTask({
        type: "RED_KPI_REVIEW",
        entityType: "KPI",
        entityId: kpiId,
        periodKey,
        title: `RED KPI incelemesi: ${kpi.name}`,
        priority: "HIGH",
        escalationLevel: level,
        assigneeId: kpi.ownerUserId,
        assigneeDeptId: kpi.responsibleDeptId,
        links: { kpiId, kpiPeriodRecordId: recordId },
      });

      if (kpi.ownerUserId) {
        await db.notify({
          userId: kpi.ownerUserId,
          type: "KPI_RED",
          title: `KPI kırmızı: ${kpi.name}`,
          entityType: "KPI",
          entityId: kpiId,
          periodKey,
        });
      }

      if (level === 2) {
        const sponsorId = await db.getHoshinSponsorForKpi(kpi.actionPlanId);
        const pmoUsers = await db.findUsersByRole("PMO");
        const seen = new Set<string>();
        const recipients: { id: string }[] = [];
        for (const id of [sponsorId, ...pmoUsers.map((u) => u.id)]) {
          if (id && !seen.has(id)) {
            seen.add(id);
            recipients.push({ id });
          }
        }
        for (const r of recipients) {
          await db.notify({
            userId: r.id,
            type: "STRATEGIC_ESCALATION",
            title: `Stratejik eskalasyon: ${kpi.name}`,
            body: `${consecutiveRed} ardışık dönem RED.`,
            entityType: "KPI",
            entityId: kpiId,
            periodKey,
          });
        }
        await db.recordAudit({
          actorUserId: session.userId,
          action: "ESCALATE",
          entityType: "KPI",
          entityId: kpiId,
          changes: [{ field: "escalationLevel", old: null, new: 2 }],
          summary: `KPI ${consecutiveRed} ardışık RED → seviye 2 stratejik eskalasyon`,
          context: "saveKpiRecord",
        });
        logEvent("info", "escalation.raised", {
          kpiId,
          level: 2,
          consecutiveRed,
          context: "saveKpiRecord",
        });
      }
    }
  } catch (e) {
    logEvent("error", "saveKpiRecord.failed", {
      kpiId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Kayıt kaydedilemedi. Lütfen tekrar deneyin." };
  }

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/countermeasure");
  revalidatePath("/");
  revalidatePath("/my-kpis");
  revalidatePath("/reports");
  revalidatePath("/my-tasks");
  revalidatePath("/notifications");

  return { success: true };
}

/** Dönem kaydını kilitler (FR-41, INV-6). Yalnız ADMIN/PMO. Denetlenir. */
export async function lockPeriod(recordId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  });
  if (!dbUser) {
    return { success: false, error: "Kullanıcı bulunamadı." };
  }
  if (!canManageSettings(dbUser.role)) {
    return { success: false, error: "Bu işlem için ADMIN/PMO yetkisi gerekir." };
  }

  const rec = await prisma.kPIPeriodRecord.findUnique({
    where: { id: recordId },
    select: { id: true, locked: true },
  });
  if (!rec) {
    return { success: false, error: "Dönem kaydı bulunamadı." };
  }
  if (rec.locked) {
    return { success: false, error: "Dönem zaten kilitli." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.kPIPeriodRecord.update({
      where: { id: recordId },
      data: { locked: true, lockedAt: new Date(), lockedById: dbUser.id },
    });
    await recordAudit(tx, {
      actorUserId: dbUser.id,
      action: "LOCK",
      entityType: "KPIPeriodRecord",
      entityId: recordId,
      changes: [{ field: "locked", old: false, new: true }],
      summary: "Dönem kilitlendi",
      context: "lockPeriod",
    });
  });
  logEvent("info", "period.locked", { recordId, actorUserId: dbUser.id });

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/reports");
  return { success: true };
}

/** Kilitli dönem kaydının kilidini açar (INV-6). Yalnız ADMIN/PMO. Denetlenir. */
export async function reopenPeriod(recordId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  });
  if (!dbUser) {
    return { success: false, error: "Kullanıcı bulunamadı." };
  }
  if (!canManageSettings(dbUser.role)) {
    return { success: false, error: "Bu işlem için ADMIN/PMO yetkisi gerekir." };
  }

  const rec = await prisma.kPIPeriodRecord.findUnique({
    where: { id: recordId },
    select: { id: true, locked: true },
  });
  if (!rec) {
    return { success: false, error: "Dönem kaydı bulunamadı." };
  }
  if (!rec.locked) {
    return { success: false, error: "Dönem zaten açık." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.kPIPeriodRecord.update({
      where: { id: recordId },
      data: { locked: false, lockedAt: null, lockedById: null },
    });
    await recordAudit(tx, {
      actorUserId: dbUser.id,
      action: "REOPEN",
      entityType: "KPIPeriodRecord",
      entityId: recordId,
      changes: [{ field: "locked", old: true, new: false }],
      summary: "Dönem kilidi açıldı",
      context: "reopenPeriod",
    });
  });
  logEvent("info", "period.reopened", { recordId, actorUserId: dbUser.id });

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/reports");
  return { success: true };
}
