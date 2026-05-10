"use server"

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getRagSettings } from "./settingActions";

export async function saveKpiRecord(kpiId: string, targetValue: number, actualValue: number, periodDate: Date, ownerComment: string) {
  const variance = actualValue - targetValue;
  const percentVariance = targetValue !== 0 ? (variance / targetValue) * 100 : 0;
  
  // RAG Algoritması (Veritabanı Ayarlarından okuyarak)
  const settings = await getRagSettings();
  
  let statusColor = "GREEN";
  if (percentVariance <= settings.redThreshold) {
    statusColor = "RED";
  } else if (percentVariance < 0 && percentVariance <= settings.amberThreshold) {
    statusColor = "AMBER";
  }

  await prisma.kPIPeriodRecord.create({
    data: {
      kpiId,
      periodStart: periodDate,
      periodEnd: new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0), // Ayın son günü
      targetValue,
      actualValue,
      variance,
      statusColor,
      ownerComment: ownerComment || (statusColor !== 'GREEN' ? "Sistem: Yorum girilmedi" : ""),
    }
  });

  // Eğer status RED ise otomatik Countermeasure açalım
  if (statusColor === "RED") {
    // Aynı dönem için açık bir CM var mı kontrol edelim
    const existingCm = await prisma.countermeasure.findFirst({
      where: { kpiId, status: 'OPEN' }
    });
    
    if (!existingCm) {
      await prisma.countermeasure.create({
        data: {
          kpiId,
          problemStatement: `${periodDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} Dönemi Sapması: Hedeflenen ${targetValue}, gerçekleşen ${actualValue}.`,
          status: "OPEN",
        }
      });
    }
  }

  revalidatePath("/kpi");
  revalidatePath("/data-entry");
  revalidatePath("/countermeasure");
  revalidatePath("/");
  
  return { success: true };
}
