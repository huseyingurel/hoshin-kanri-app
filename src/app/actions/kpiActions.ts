"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getRagSettings } from "./settingActions";
import { getSession } from "@/lib/auth";
import { kpiScopeFilter, type UserScope } from "@/lib/dataScope";
import { canManageSettings } from "@/lib/access";
import {
  computeKpiRagFromVariancePercent,
  computePercentVariance,
  shouldAutoOpenCountermeasure,
} from "@/lib/kpiRag";
import { diff, recordAudit } from "@/lib/engine/audit";
import { upsertSystemTask } from "@/lib/engine/tasks";
import { notify, notifyMany } from "@/lib/engine/notifications";
import { computeEscalationLevel } from "@/lib/engine/escalation";
import { countLeadingConsecutiveRed, parseFrequency, periodKeyFor } from "@/lib/engine/calendar";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };
export type SaveKpiRecordResult = ActionResult;

export async function saveKpiRecord(
  kpiId: string,
  targetValue: number,
  actualValue: number,
  periodDate: Date,
  ownerComment: string
): Promise<SaveKpiRecordResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) {
    return { success: false, error: "Kullanıcı bulunamadı." };
  }

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const kWhere = kpiScopeFilter(scope);

  if (kWhere) {
    const allowed = await prisma.kPI.findFirst({
      where: { id: kpiId, ...kWhere },
      select: { id: true },
    });
    if (!allowed) {
      return { success: false, error: "Bu KPI için veri girişi yetkiniz yok." };
    }
  }

  // KPI ayrıntıları: başlık/sahip/departman/sıklık + (eskalasyon için) sponsor zinciri.
  const kpi = await prisma.kPI.findUnique({
    where: { id: kpiId },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      responsibleDeptId: true,
      reportingFrequency: true,
      actionPlan: {
        select: { majorTask: { select: { hoshin: { select: { sponsorUserId: true } } } } },
      },
    },
  });
  if (!kpi) {
    return { success: false, error: "KPI bulunamadı." };
  }

  const variance = actualValue - targetValue;
  const percentVariance = computePercentVariance(actualValue, targetValue);
  const settings = await getRagSettings();
  const statusColor = computeKpiRagFromVariancePercent(percentVariance, settings);

  const periodStart = periodDate;
  const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);

  // INV-6: bu dönemle çakışan kilitli bir kayıt varsa yalnız ADMIN/PMO değiştirebilir.
  const lockedExisting = await prisma.kPIPeriodRecord.findFirst({
    where: {
      kpiId,
      locked: true,
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
    },
    select: { id: true },
  });
  if (lockedExisting && !canManageSettings(dbUser.role)) {
    return {
      success: false,
      error: "Bu dönem kilitli; düzenlemek için ADMIN/PMO yetkisi gerekir.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.kPIPeriodRecord.create({
        data: {
          kpiId,
          periodStart,
          periodEnd,
          targetValue,
          actualValue,
          variance,
          statusColor,
          ownerComment:
            ownerComment || (statusColor !== "GREEN" ? "Sistem: Yorum girilmedi" : ""),
          submittedById: session.userId,
          submittedAt: new Date(),
        },
      });

      // INV-1: her mutasyon aynı tx içinde denetlenir.
      await recordAudit(tx, {
        actorUserId: session.userId,
        action: "CREATE",
        entityType: "KPIPeriodRecord",
        entityId: record.id,
        changes: diff(
          null,
          { targetValue, actualValue, variance, statusColor },
          ["targetValue", "actualValue", "variance", "statusColor"],
        ),
        summary: `KPI dönem kaydı oluşturuldu (${statusColor})`,
        context: "saveKpiRecord",
      });

      if (!shouldAutoOpenCountermeasure(statusColor)) {
        return; // GREEN/AMBER: yalnız kayıt + denetim.
      }

      // --- RED yolu: karşı önlem + görev + bildirim + (gerekirse) eskalasyon ---
      const existingCm = await tx.countermeasure.findFirst({
        where: { kpiId, status: "OPEN" },
        select: { id: true },
      });
      if (!existingCm) {
        const cm = await tx.countermeasure.create({
          data: {
            kpiId,
            problemStatement: `${periodDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} Dönemi Sapması: Hedeflenen ${targetValue}, gerçekleşen ${actualValue}.`,
            status: "OPEN",
          },
        });
        await recordAudit(tx, {
          actorUserId: session.userId,
          action: "CREATE",
          entityType: "Countermeasure",
          entityId: cm.id,
          summary: "RED KPI için karşı önlem otomatik açıldı",
          context: "saveKpiRecord",
        });
      }

      const frequency = parseFrequency(kpi.reportingFrequency);
      const periodKey = periodKeyFor(periodStart, frequency);

      // Ardışık RED'i (yeni kayıt dahil) hesapla → eskalasyon seviyesi.
      const recent = await tx.kPIPeriodRecord.findMany({
        where: { kpiId },
        orderBy: { periodStart: "desc" },
        select: { periodStart: true, statusColor: true },
      });
      const consecutiveRed = countLeadingConsecutiveRed(recent, frequency);
      const level = computeEscalationLevel({ daysOverdue: 0, consecutiveRed });

      await upsertSystemTask(tx, {
        type: "RED_KPI_REVIEW",
        entityType: "KPI",
        entityId: kpiId,
        periodKey,
        title: `RED KPI incelemesi: ${kpi.name}`,
        priority: "HIGH",
        escalationLevel: level,
        assigneeId: kpi.ownerUserId,
        assigneeDeptId: kpi.responsibleDeptId,
        links: { kpiId, kpiPeriodRecordId: record.id },
      });

      if (kpi.ownerUserId) {
        await notify(tx, {
          userId: kpi.ownerUserId,
          type: "KPI_RED",
          title: `KPI kırmızı: ${kpi.name}`,
          entityType: "KPI",
          entityId: kpiId,
          periodKey,
        });
      }

      if (level === 2) {
        const sponsorId = kpi.actionPlan?.majorTask?.hoshin?.sponsorUserId ?? null;
        const pmoUsers = await tx.user.findMany({
          where: { role: "PMO" },
          select: { id: true },
        });
        const seen = new Set<string>();
        const recipients: { id: string }[] = [];
        for (const id of [sponsorId, ...pmoUsers.map((u) => u.id)]) {
          if (id && !seen.has(id)) {
            seen.add(id);
            recipients.push({ id });
          }
        }
        if (recipients.length > 0) {
          await notifyMany(tx, recipients, {
            type: "STRATEGIC_ESCALATION",
            title: `Stratejik eskalasyon: ${kpi.name}`,
            body: `${consecutiveRed} ardışık dönem RED.`,
            entityType: "KPI",
            entityId: kpiId,
            periodKey,
          });
        }
        await recordAudit(tx, {
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
    });
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
