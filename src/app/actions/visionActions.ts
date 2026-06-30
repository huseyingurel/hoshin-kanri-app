"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import { isVisionStatus } from "@/lib/domainTypes";
import { recordAudit, diff } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";
import { hoshinScopeFilter, type UserScope } from "@/lib/dataScope";

export type ActionResult = { success: true } | { success: false; error: string };

async function getActorScope(): Promise<UserScope | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

/**
 * Kullanıcı kapsamındaki vizyonları listeler.
 * Kurum geneli roller hepsini görür; departman kapsamlı roller yalnız kapsamlarındaki
 * hoshinlere bağlı vizyonları görür.
 */
export async function listVisions() {
  const scope = await getActorScope();
  if (!scope) return [];

  if (isOrgWideRole(scope.role)) {
    return prisma.vision.findMany({ orderBy: { year: "desc" } });
  }

  const hWhere = hoshinScopeFilter(scope);
  const hoshins = await prisma.hoshin.findMany({
    where: hWhere ? { ...hWhere, visionId: { not: null } } : { visionId: { not: null } },
    select: { visionId: true },
  });
  const visionIds = [...new Set(hoshins.flatMap((h) => (h.visionId ? [h.visionId] : [])))];
  if (visionIds.length === 0) return [];
  return prisma.vision.findMany({
    where: { id: { in: visionIds } },
    orderBy: { year: "desc" },
  });
}

/** Yeni vizyon (True North) oluşturur. Yalnız kurum geneli roller. `statement+year` benzersizdir. */
export async function createVision(input: {
  statement: string;
  description?: string;
  year: number;
  status?: string;
  ownerUserId?: string;
}): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller vizyon oluşturabilir." };
  }
  const status = input.status ?? "DRAFT";
  if (!isVisionStatus(status)) {
    return { success: false, error: `Geçersiz vizyon durumu: ${status}` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.vision.create({
        data: {
          statement: input.statement.trim(),
          description: input.description?.trim() ?? null,
          year: input.year,
          status,
          ownerUserId: input.ownerUserId ?? null,
        },
      });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "CREATE",
        entityType: "Vision",
        entityId: created.id,
        summary: "Vizyon oluşturuldu",
        context: "createVision",
      });
      logEvent("info", "vision.created", { visionId: created.id, year: created.year });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { success: false, error: "Bu yıl için aynı ifadeye sahip bir vizyon zaten mevcut." };
    }
    logEvent("error", "createVision.failed", { message: msg });
    return { success: false, error: "Vizyon oluşturulamadı. Lütfen tekrar deneyin." };
  }
}

/** Vizyon alanlarını günceller. `statement+year` benzersizliği ihlali → tipli hata. */
export async function updateVision(
  id: string,
  input: {
    statement?: string;
    description?: string;
    year?: number;
    status?: string;
    ownerUserId?: string | null;
  },
): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller vizyon güncelleyebilir." };
  }
  if (input.status !== undefined && !isVisionStatus(input.status)) {
    return { success: false, error: `Geçersiz vizyon durumu: ${input.status}` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.vision.findUniqueOrThrow({ where: { id } });
      const after = await tx.vision.update({
        where: { id },
        data: {
          ...(input.statement !== undefined ? { statement: input.statement.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
          ...(input.year !== undefined ? { year: input.year } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...("ownerUserId" in input ? { ownerUserId: input.ownerUserId ?? null } : {}),
        },
      });
      const changes = diff(
        before as Record<string, unknown>,
        after as Record<string, unknown>,
        ["statement", "description", "year", "status", "ownerUserId"],
      );
      if (changes.length > 0) {
        await recordAudit(tx, {
          actorUserId: scope.id,
          action: "UPDATE",
          entityType: "Vision",
          entityId: id,
          changes,
          summary: "Vizyon güncellendi",
          context: "updateVision",
        });
      }
      logEvent("info", "vision.updated", { visionId: id });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { success: false, error: "Bu yıl için aynı ifadeye sahip bir vizyon zaten mevcut." };
    }
    logEvent("error", "updateVision.failed", { visionId: id, message: msg });
    return { success: false, error: "Vizyon güncellenemedi. Lütfen tekrar deneyin." };
  }
}

/**
 * Vizyonu siler. Bağlı hoshinlerin `visionId` alanı `null` olarak güncellenir
 * (şemada `onDelete: SetNull` ile tutarlı; burada tx'te açıkça yapılır).
 */
export async function deleteVision(id: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller vizyon silebilir." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.hoshin.updateMany({ where: { visionId: id }, data: { visionId: null } });
      await tx.vision.delete({ where: { id } });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "DELETE",
        entityType: "Vision",
        entityId: id,
        summary: "Vizyon silindi",
        context: "deleteVision",
      });
      logEvent("info", "vision.deleted", { visionId: id });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent("error", "deleteVision.failed", { visionId: id, message: msg });
    return { success: false, error: "Vizyon silinemedi. Lütfen tekrar deneyin." };
  }
}

/**
 * Bir hoshini bir vizyona bağlar (veya `null` ile bağlantıyı kaldırır).
 * `visionId` değişikliği denetlenir (INV-1).
 */
export async function linkHoshinToVision(
  hoshinId: string,
  visionId: string | null,
): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller hoshin-vizyon bağlantısı oluşturabilir." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.hoshin.findUniqueOrThrow({
        where: { id: hoshinId },
        select: { visionId: true },
      });
      await tx.hoshin.update({ where: { id: hoshinId }, data: { visionId } });
      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "UPDATE",
        entityType: "Hoshin",
        entityId: hoshinId,
        changes: [{ field: "visionId", old: before.visionId, new: visionId }],
        summary: visionId ? "Hoshin vizyona bağlandı" : "Hoshin vizyon bağlantısı kaldırıldı",
        context: "linkHoshinToVision",
      });
      logEvent("info", "hoshin.visionLinked", { hoshinId, visionId });
    });
    revalidatePath("/strategy");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent("error", "linkHoshinToVision.failed", { hoshinId, visionId, message: msg });
    return { success: false, error: "Hoshin-vizyon bağlantısı oluşturulamadı. Lütfen tekrar deneyin." };
  }
}
