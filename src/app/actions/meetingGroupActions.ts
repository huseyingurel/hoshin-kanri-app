"use server";

/**
 * FR-26 (toplantı grubuna / role göre görev atama):
 *  - İnceleme katılımcı roster'ı (toplantı grubu) yönetimi: ekle / çıkar / listele.
 *  - `assignTaskToMeeting`: seçili toplantının tüm katılımcılarına birer görev dağıtır (fan-out).
 *  - `assignTaskToRole`: bir role sahip tüm kullanıcılara birer görev dağıtır (fan-out).
 *
 * Görevler `source=MANUAL` olarak, mevcut kullanıcı-bazlı kapsamlama (`assigneeId`) ile uyumlu
 * biçimde somut kullanıcılara açılır; her görev için bir `CREATE` denetim kaydı yazılır (INV-1).
 * Yetki: katılımcı yönetimi + toplantı ataması kurum geneli roller veya toplantı organizatörü;
 * rol ataması yalnız kurum geneli roller.
 */

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import { isAssignableRole, isTaskPriority } from "@/lib/domainTypes";
import { recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";
import type { UserScope } from "@/lib/dataScope";
import type { Prisma } from "@prisma/client";

export type ActionResult = { success: true } | { success: false; error: string };
export type FanoutResult = { success: true; count: number } | { success: false; error: string };

async function getActorScope(): Promise<UserScope | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

/** Bir incelemenin katılımcılarını (toplantı grubu) döner. */
export async function getReviewParticipants(reviewId: string) {
  const scope = await getActorScope();
  if (!scope) return [];
  return prisma.reviewParticipant.findMany({
    where: { reviewId },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Kurum geneli rol veya toplantı organizatörü mü? (katılımcı/toplantı işlemleri yetkisi) */
async function canManageReview(scope: UserScope, reviewId: string): Promise<boolean> {
  if (isOrgWideRole(scope.role)) return true;
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { organizerId: true },
  });
  return !!review && review.organizerId === scope.id;
}

/** Toplantı grubuna katılımcı ekler (idempotent — aynı kullanıcı iki kez eklenmez). */
export async function addReviewParticipant(reviewId: string, userId: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!(await canManageReview(scope, reviewId))) {
    return { success: false, error: "Bu toplantının katılımcılarını düzenleme yetkiniz yok." };
  }
  try {
    await prisma.reviewParticipant.upsert({
      where: { reviewId_userId: { reviewId, userId } },
      create: { reviewId, userId },
      update: {},
    });
  } catch (e) {
    logEvent("error", "addReviewParticipant.failed", {
      reviewId,
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Katılımcı eklenemedi. Lütfen tekrar deneyin." };
  }
  revalidatePath("/meetings");
  return { success: true };
}

/** Toplantı grubundan katılımcı çıkarır. */
export async function removeReviewParticipant(reviewId: string, userId: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!(await canManageReview(scope, reviewId))) {
    return { success: false, error: "Bu toplantının katılımcılarını düzenleme yetkiniz yok." };
  }
  try {
    await prisma.reviewParticipant.deleteMany({ where: { reviewId, userId } });
  } catch (e) {
    logEvent("error", "removeReviewParticipant.failed", {
      reviewId,
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Katılımcı çıkarılamadı. Lütfen tekrar deneyin." };
  }
  revalidatePath("/meetings");
  return { success: true };
}

/** Görev iskeleti (fan-out girişleri için ortak alanlar). */
interface TaskFanoutInput {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: Date;
}

/** Verilen kullanıcı kimliklerine birer MANUAL görev açar; her biri için CREATE denetimi. */
async function fanoutTasks(
  tx: Prisma.TransactionClient,
  actorId: string,
  userIds: string[],
  input: TaskFanoutInput,
  opts: { assigneeRole?: string; context: string; summaryLabel: string },
): Promise<number> {
  const title = input.title.trim();
  const priority = input.priority && isTaskPriority(input.priority) ? input.priority : "MEDIUM";
  let created = 0;
  for (const userId of userIds) {
    const task = await tx.task.create({
      data: {
        type: "DECISION_FOLLOWUP", // elle görevler için genel tür; source ile ayrışır
        title,
        description: input.description?.trim() || null,
        source: "MANUAL",
        status: "OPEN",
        priority,
        dueDate: input.dueDate ?? null,
        assigneeId: userId,
        assigneeRole: opts.assigneeRole ?? null,
      },
    });
    await recordAudit(tx, {
      actorUserId: actorId,
      action: "CREATE",
      entityType: "Task",
      entityId: task.id,
      summary: `${opts.summaryLabel}: ${title.slice(0, 80)}`,
      context: opts.context,
    });
    created++;
  }
  return created;
}

/**
 * Bir toplantının tüm katılımcılarına (toplantı grubu) birer görev dağıtır (FR-26).
 * Yetki: kurum geneli roller veya toplantı organizatörü.
 */
export async function assignTaskToMeeting(
  reviewId: string,
  input: TaskFanoutInput,
): Promise<FanoutResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!input.title?.trim()) return { success: false, error: "Görev başlığı zorunludur." };
  if (!(await canManageReview(scope, reviewId))) {
    return { success: false, error: "Bu toplantıya görev atama yetkiniz yok." };
  }

  const participants = await prisma.reviewParticipant.findMany({
    where: { reviewId },
    select: { userId: true },
  });
  const userIds = [...new Set(participants.map((p) => p.userId))];
  if (userIds.length === 0) {
    return { success: false, error: "Toplantı grubunda katılımcı yok. Önce katılımcı ekleyin." };
  }

  try {
    const count = await prisma.$transaction(
      (tx) =>
        fanoutTasks(tx, scope.id, userIds, input, {
          context: "assignTaskToMeeting",
          summaryLabel: "Toplantı grubuna görev atandı",
        }),
      { timeout: 20000 }, // büyük katılımcı listesinde ardışık insert'ler varsayılan 5s'i aşabilir
    );
    logEvent("info", "task.assignedToMeeting", { reviewId, count });
    revalidatePath("/my-tasks");
    revalidatePath("/meetings");
    return { success: true, count };
  } catch (e) {
    logEvent("error", "assignTaskToMeeting.failed", {
      reviewId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Görevler atanamadı. Lütfen tekrar deneyin." };
  }
}

/**
 * Belirli bir role sahip tüm kullanıcılara birer görev dağıtır (FR-26).
 * Yetki: yalnız kurum geneli roller.
 */
export async function assignTaskToRole(role: string, input: TaskFanoutInput): Promise<FanoutResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller role göre görev atayabilir." };
  }
  if (!isAssignableRole(role)) {
    return { success: false, error: `Geçersiz rol: ${role}` };
  }
  if (!input.title?.trim()) return { success: false, error: "Görev başlığı zorunludur." };

  const users = await prisma.user.findMany({ where: { role }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) {
    return { success: false, error: `"${role}" rolünde kullanıcı yok.` };
  }

  try {
    const count = await prisma.$transaction(
      (tx) =>
        fanoutTasks(tx, scope.id, userIds, input, {
          assigneeRole: role,
          context: "assignTaskToRole",
          summaryLabel: `Rol (${role}) görev atandı`,
        }),
      { timeout: 20000 }, // kalabalık bir rolde ardışık insert'ler varsayılan 5s'i aşabilir
    );
    logEvent("info", "task.assignedToRole", { role, count });
    revalidatePath("/my-tasks");
    return { success: true, count };
  } catch (e) {
    logEvent("error", "assignTaskToRole.failed", {
      role,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Görevler atanamadı. Lütfen tekrar deneyin." };
  }
}
