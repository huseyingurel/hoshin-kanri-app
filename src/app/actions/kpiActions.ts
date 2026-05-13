"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getRagSettings } from "./settingActions";
import { getSession } from "@/lib/auth";
import { kpiScopeFilter, type UserScope } from "@/lib/dataScope";
import {
  computeKpiRagFromVariancePercent,
  computePercentVariance,
  shouldAutoOpenCountermeasure,
} from "@/lib/kpiRag";

export type SaveKpiRecordResult = { success: true } | { success: false; error: string };

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
    });
    if (!allowed) {
      return { success: false, error: "Bu KPI için veri girişi yetkiniz yok." };
    }
  }

  const variance = actualValue - targetValue;
  const percentVariance = computePercentVariance(actualValue, targetValue);

  const settings = await getRagSettings();

  const statusColor = computeKpiRagFromVariancePercent(percentVariance, settings);

  await prisma.kPIPeriodRecord.create({
    data: {
      kpiId,
      periodStart: periodDate,
      periodEnd: new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0),
      targetValue,
      actualValue,
      variance,
      statusColor,
      ownerComment: ownerComment || (statusColor !== "GREEN" ? "Sistem: Yorum girilmedi" : ""),
      submittedById: session.userId,
      submittedAt: new Date(),
    },
  });

  if (shouldAutoOpenCountermeasure(statusColor)) {
    const existingCm = await prisma.countermeasure.findFirst({
      where: { kpiId, status: "OPEN" },
    });

    if (!existingCm) {
      await prisma.countermeasure.create({
        data: {
          kpiId,
          problemStatement: `${periodDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} Dönemi Sapması: Hedeflenen ${targetValue}, gerçekleşen ${actualValue}.`,
          status: "OPEN",
        },
      });
    }
  }

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/countermeasure");
  revalidatePath("/");
  revalidatePath("/my-kpis");
  revalidatePath("/reports");

  return { success: true };
}
