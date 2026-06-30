"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { taskScopeFilter, type UserScope } from "@/lib/dataScope";
import { diff, recordAudit } from "@/lib/engine/audit";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };

type TaskScopeUser = { id: string; role: string; departmentId: string | null } | null;

async function currentScope(): Promise<TaskScopeUser> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

/** Kullanıcının kapsamındaki görevleri döner (kurum geneli → hepsi; departman kapsamlı →
 * kendine/departmanına atanmış). İptal edilenler hariç, durum sonra önceliğe göre sıralı. */
export async function getMyTasks() {
  const dbUser = await currentScope();
  if (!dbUser) return [];

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const where = taskScopeFilter(scope);

  return prisma.task.findMany({
    where: {
      AND: [{ status: { not: "CANCELLED" } }, ...(where ? [where] : [])],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      assigneeDept: { select: { id: true, name: true } },
      kpi: { select: { id: true, name: true } },
      countermeasure: { select: { id: true, problemStatement: true } },
      actionPlan: { select: { id: true, title: true } },
      decision: { select: { id: true, decisionText: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
}

function isTaskStatus(s: string): s is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(s);
}

/** Görev durumunu günceller. Kapsam dışı görev güncellenemez (INV-4). Denetlenir (INV-1). */
export async function updateTaskStatus(taskId: string, status: string): Promise<ActionResult> {
  const dbUser = await currentScope();
  if (!dbUser) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  if (!isTaskStatus(status)) {
    return { success: false, error: "Geçersiz görev durumu." };
  }

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const where = taskScopeFilter(scope);

  // Kapsam filtresiyle birlikte ara: kapsam dışıysa bulunmaz → yetki yok.
  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, ...(where ? [where] : [])] },
    select: { id: true, status: true },
  });
  if (!task) {
    return { success: false, error: "Görev bulunamadı veya yetkiniz yok." };
  }
  if (task.status === status) {
    return { success: true };
  }

  const closing = status === "DONE" || status === "CANCELLED";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          status,
          closedAt: closing ? new Date() : null,
          closedById: closing ? dbUser.id : null,
        },
      });
      await recordAudit(tx, {
        actorUserId: dbUser.id,
        action: "UPDATE",
        entityType: "Task",
        entityId: taskId,
        changes: diff({ status: task.status }, { status }, ["status"]),
        summary: `Görev durumu güncellendi: ${task.status} → ${status}`,
        context: "updateTaskStatus",
      });
    });
  } catch (e) {
    logEvent("error", "updateTaskStatus.failed", {
      taskId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Görev güncellenemedi. Lütfen tekrar deneyin." };
  }

  revalidatePath("/my-tasks");
  revalidatePath("/meetings");
  return { success: true };
}

function isTaskPriority(s: string): s is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(s);
}

/** Elle görev oluşturur (source=MANUAL). Atanan kullanıcı yoksa oluşturana atanır. */
export async function createManualTask(input: {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: Date;
  assigneeId?: string;
}): Promise<ActionResult> {
  const dbUser = await currentScope();
  if (!dbUser) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  const title = input.title?.trim();
  if (!title) {
    return { success: false, error: "Görev başlığı zorunludur." };
  }
  const priority = input.priority && isTaskPriority(input.priority) ? input.priority : "MEDIUM";
  const assigneeId = input.assigneeId || dbUser.id;

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          type: "DECISION_FOLLOWUP", // elle görevler için genel tür; source ile ayrışır
          title,
          description: input.description?.trim() || null,
          source: "MANUAL",
          status: "OPEN",
          priority,
          dueDate: input.dueDate ?? null,
          assigneeId,
        },
      });
      await recordAudit(tx, {
        actorUserId: dbUser.id,
        action: "CREATE",
        entityType: "Task",
        entityId: task.id,
        summary: `Elle görev oluşturuldu: ${title.slice(0, 80)}`,
        context: "createManualTask",
      });
    });
  } catch (e) {
    logEvent("error", "createManualTask.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Görev oluşturulamadı. Lütfen tekrar deneyin." };
  }

  revalidatePath("/my-tasks");
  return { success: true };
}
