"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import {
  countermeasureOpenScopeFilter,
  kpiScopeFilter,
  type UserScope,
} from "@/lib/dataScope";

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

export async function createReview(data: { title: string; type: string; date: Date; organizerId?: string }) {
  const review = await prisma.review.create({
    data: {
      title: data.title,
      type: data.type,
      date: data.date,
      status: "SCHEDULED",
      organizerId: data.organizerId,
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
    return { activeRedKpis: [], openCountermeasures: [] };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) {
    return { activeRedKpis: [], openCountermeasures: [] };
  }

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const kWhere = kpiScopeFilter(scope);
  const cmWhere = countermeasureOpenScopeFilter(scope);

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

  return { activeRedKpis, openCountermeasures };
}

export async function createDecision(data: {
  reviewId: string;
  decisionText: string;
  dueDate?: Date;
  kpiId?: string;
  actionPlanId?: string;
  assigneeId?: string;
}) {
  const decision = await prisma.decision.create({
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

  revalidatePath("/meetings");
  revalidatePath("/reviews");
  revalidatePath("/my-reviews");
  return decision;
}
