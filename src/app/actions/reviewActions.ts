"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import {
  countermeasureOpenScopeFilter,
  kpiScopeFilter,
  taskScopeFilter,
  type UserScope,
} from "@/lib/dataScope";
import { recordAudit } from "@/lib/engine/audit";
import { upsertSystemTask } from "@/lib/engine/tasks";
import { notify } from "@/lib/engine/notifications";
import { deliverEmail } from "@/lib/email";
import { assembleAgenda } from "@/lib/engine/agenda";

export async function getReviews() {
  const session = await getSession();
  if (!session?.userId) return [];

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) return [];

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const orgWide = isOrgWideRole(scope.role);

  return prisma.review.findMany({
    ...(orgWide
      ? {}
      : {
          where: {
            OR: [{ organizerId: scope.id }, { decisions: { some: { assigneeId: scope.id } } }],
          },
        }),
    orderBy: { date: "asc" },
    include: {
      organizer: true,
      decisions: {
        include: {
          assignee: {
            include: {
              department: true,
            },
          },
        },
      },
    },
  });
}

export async function createReview(data: {
  title: string;
  type: string;
  date: Date;
  organizerId?: string;
  frequency?: string;
  chairUserId?: string;
  coordinatorUserId?: string;
}) {
  const review = await prisma.review.create({
    data: {
      title: data.title,
      type: data.type,
      date: data.date,
      status: "SCHEDULED",
      organizerId: data.organizerId,
      frequency: data.frequency || null,
      chairUserId: data.chairUserId || null,
      coordinatorUserId: data.coordinatorUserId || null,
    },
  });

  revalidatePath("/meetings");
  revalidatePath("/reviews");
  revalidatePath("/my-reviews");
  return review;
}

export async function getReviewAgendaItems() {
  const session = await getSession();
  if (!session?.userId) {
    return { activeRedKpis: [], openCountermeasures: [], overdueTasks: [] };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) {
    return { activeRedKpis: [], openCountermeasures: [], overdueTasks: [] };
  }

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const kWhere = kpiScopeFilter(scope);
  const cmWhere = countermeasureOpenScopeFilter(scope);
  const tWhere = taskScopeFilter(scope);

  const redKpis = await prisma.kPI.findMany({
    where: {
      AND: [
        {
          periodRecords: {
            some: { statusColor: "RED" },
          },
        },
        ...(kWhere ? [kWhere] : []),
      ],
    },
    include: {
      periodRecords: {
        orderBy: { periodStart: "desc" },
        take: 1,
      },
      responsibleDept: true,
      ownerUser: true,
    },
  });

  const activeRedKpis = redKpis.filter((kpi) => kpi.periodRecords[0]?.statusColor === "RED");

  const openCountermeasures = await prisma.countermeasure.findMany({
    where: cmWhere,
    include: {
      kpi: true,
      ownerUser: true,
    },
  });

  // G7: gündeme vadesi geçmiş açık görevleri ekle (kabul kriteri #5).
  const overdueTasks = await prisma.task.findMany({
    where: {
      AND: [
        { status: { in: ["OPEN", "IN_PROGRESS"] } },
        { dueDate: { lt: new Date() } },
        ...(tWhere ? [tWhere] : []),
      ],
    },
    include: {
      assignee: true,
      assigneeDept: true,
      kpi: true,
    },
    orderBy: { dueDate: "asc" },
  });

  return { activeRedKpis, openCountermeasures, overdueTasks };
}

/** FR-31/32: seçili inceleme için kategorize gündem (karar bekleyenler dahil). */
export async function getReviewAgenda(reviewId: string) {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) return null;
  const scope: UserScope = { id: dbUser.id, role: dbUser.role, departmentId: dbUser.departmentId };
  const pkg = await assembleAgenda(prisma, reviewId, scope);
  // İstemciye yalnız karar-bekleyenleri ve sayımları döndür (diğer kategoriler zaten sayfada).
  return { decisionsNeeded: pkg.decisionsNeeded, counts: pkg.counts };
}

export async function createDecision(data: {
  reviewId: string;
  decisionText: string;
  dueDate?: Date;
  kpiId?: string;
  actionPlanId?: string;
  assigneeId?: string;
}) {
  const session = await getSession();

  // INV-1: karar + denetim + takip görevi + bildirim tek transaction içinde.
  const decision = await prisma.$transaction(async (tx) => {
    const d = await tx.decision.create({
      data: {
        reviewId: data.reviewId,
        decisionText: data.decisionText,
        status: "OPEN",
        dueDate: data.dueDate,
        kpiId: data.kpiId,
        actionPlanId: data.actionPlanId,
        assigneeId: data.assigneeId,
      },
    });

    await recordAudit(tx, {
      actorUserId: session?.userId ?? null,
      action: "CREATE",
      entityType: "Decision",
      entityId: d.id,
      summary: "Toplantı kararı oluşturuldu",
      context: "createDecision",
    });

    await upsertSystemTask(tx, {
      type: "DECISION_FOLLOWUP",
      entityType: "Decision",
      entityId: d.id,
      title: `Karar takibi: ${data.decisionText.slice(0, 80)}`,
      priority: "MEDIUM",
      dueDate: data.dueDate ?? null,
      assigneeId: data.assigneeId ?? null,
      links: {
        decisionId: d.id,
        kpiId: data.kpiId ?? null,
        actionPlanId: data.actionPlanId ?? null,
      },
    });

    if (data.assigneeId) {
      await notify(tx, {
        userId: data.assigneeId,
        type: "DECISION_ASSIGNED",
        title: "Size bir karar atandı",
        body: data.decisionText.slice(0, 200),
        entityType: "Decision",
        entityId: d.id,
      });
    }

    return d;
  });

  // FR-28: in-app bildirim commit edildi; e-posta commit SONRASI denenir (in-app kaynak doğrudur).
  if (data.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: data.assigneeId },
      select: { email: true },
    });
    await deliverEmail({
      to: assignee?.email,
      type: "DECISION_ASSIGNED",
      ctx: {
        title: "Size bir karar atandı",
        body: data.decisionText.slice(0, 200),
        link: `/meetings?review=${data.reviewId}`,
      },
    });
  }

  revalidatePath("/meetings");
  revalidatePath("/reviews");
  revalidatePath("/my-reviews");
  revalidatePath("/my-tasks");
  revalidatePath("/notifications");
  return decision;
}
