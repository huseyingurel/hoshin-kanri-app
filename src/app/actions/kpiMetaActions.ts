"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { canManageSettings, isOrgWideRole } from "@/lib/access";
import { isReportingFrequency } from "@/lib/domainTypes";
import { diff, recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };

export interface KpiMetaInput {
  targetYear?: number;
  ownerUserId?: string | null;
  reportingFrequency?: string;
  definition?: string | null;
  redThreshold?: number | null;
  amberThreshold?: number | null;
}

const META_FIELDS = [
  "targetYear",
  "ownerUserId",
  "reportingFrequency",
  "definition",
  "redThreshold",
  "amberThreshold",
] as const;

/**
 * KPI meta verisini denetlenerek günceller (FR-17/40): hedef/sahip/sıklık/tanım/eşikler.
 * `diff()` tabanlı denetim kaydı yazar. Hedef değişimi: KPI'nın kilitli dönemi varsa yalnız
 * ADMIN/PMO değiştirebilir (kilit kuralı). Yetki: kurum geneli rol veya KPI sahibi.
 */
export async function updateKpiMeta(kpiId: string, input: KpiMetaInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) return { success: false, error: "Oturum bulunamadı." };

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  });
  if (!dbUser) return { success: false, error: "Kullanıcı bulunamadı." };

  if (input.reportingFrequency !== undefined && !isReportingFrequency(input.reportingFrequency)) {
    return { success: false, error: `Geçersiz raporlama sıklığı: ${input.reportingFrequency}` };
  }

  const kpi = await prisma.kPI.findUnique({
    where: { id: kpiId },
    select: {
      id: true,
      ownerUserId: true,
      targetYear: true,
      reportingFrequency: true,
      definition: true,
      redThreshold: true,
      amberThreshold: true,
    },
  });
  if (!kpi) return { success: false, error: "KPI bulunamadı." };

  // Yetki: kurum geneli rol veya KPI sahibi.
  const canEdit = isOrgWideRole(dbUser.role) || kpi.ownerUserId === dbUser.id;
  if (!canEdit) return { success: false, error: "Bu KPI'yı düzenleme yetkiniz yok." };

  // Hedef değişimi + kilitli dönem → yalnız ADMIN/PMO.
  const changingTarget = input.targetYear !== undefined && input.targetYear !== kpi.targetYear;
  if (changingTarget) {
    const lockedCount = await prisma.kPIPeriodRecord.count({ where: { kpiId, locked: true } });
    if (lockedCount > 0 && !canManageSettings(dbUser.role)) {
      return {
        success: false,
        error: "Bu KPI'nın kilitli dönemleri var; hedefi değiştirmek için ADMIN/PMO yetkisi gerekir.",
      };
    }
  }

  // Yalnız verilen alanları uygula.
  const data: Record<string, unknown> = {};
  if (input.targetYear !== undefined) data.targetYear = input.targetYear;
  if (input.ownerUserId !== undefined) data.ownerUserId = input.ownerUserId;
  if (input.reportingFrequency !== undefined) data.reportingFrequency = input.reportingFrequency;
  if (input.definition !== undefined) data.definition = input.definition?.trim() || null;
  if (input.redThreshold !== undefined) data.redThreshold = input.redThreshold;
  if (input.amberThreshold !== undefined) data.amberThreshold = input.amberThreshold;

  const changes = diff(kpi as Record<string, unknown>, { ...kpi, ...data }, META_FIELDS);
  if (changes.length === 0) {
    return { success: true }; // değişiklik yok → no-op (denetim kaydı yazma)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.kPI.update({ where: { id: kpiId }, data });
      await recordAudit(tx, {
        actorUserId: dbUser.id,
        action: "UPDATE",
        entityType: "KPI",
        entityId: kpiId,
        changes,
        summary: `KPI meta güncellendi: ${changes.map((c) => c.field).join(", ")}`,
        context: "updateKpiMeta",
      });
    });
    logEvent("info", "kpiMeta.updated", { kpiId, fields: changes.map((c) => c.field) });
  } catch (e) {
    logEvent("error", "kpiMeta.failed", { kpiId, message: e instanceof Error ? e.message : String(e) });
    return { success: false, error: "KPI güncellenemedi." };
  }

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/my-kpis");
  return { success: true };
}

/** KPI meta değişiklik geçmişi (FR-40 "Değişiklik Geçmişi"): AuditLog'dan okur. */
export async function getKpiAuditHistory(kpiId: string) {
  const session = await getSession();
  if (!session?.userId) return [];
  return prisma.auditLog.findMany({
    where: { entityType: "KPI", entityId: kpiId },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });
}
