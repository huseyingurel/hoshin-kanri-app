"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

// Tüm Değerlendirmeleri (Toplantı veya Uzman İncelemesi) getirir
export async function getReviews() {
  return await prisma.review.findMany({
    orderBy: { date: 'asc' },
    include: {
      organizer: true,
      decisions: true
    }
  });
}

// Yeni bir Değerlendirme (Review) oluşturur
export async function createReview(data: { title: string, type: string, date: Date, organizerId?: string }) {
  const review = await prisma.review.create({
    data: {
      title: data.title,
      type: data.type, // 'MEETING' veya 'EXPERT_REVIEW'
      date: data.date,
      status: 'SCHEDULED',
      organizerId: data.organizerId
    }
  });
  
  revalidatePath("/meetings");
  revalidatePath("/reviews"); // Gelecekteki route güncellemesi için
  return review;
}

// Belirli bir değerlendirme için, gündeme alınması gereken Kırmızı KPI'ları ve Açık Countermeasure'ları getirir
export async function getReviewAgendaItems() {
  // 1. Kırmızı KPI'ları bul
  const redKpis = await prisma.kPI.findMany({
    where: {
      periodRecords: {
        some: { statusColor: 'RED' }
      }
    },
    include: {
      periodRecords: {
        orderBy: { periodStart: 'desc' },
        take: 1
      },
      responsibleDept: true,
      ownerUser: true
    }
  });

  // Filtreleme: Yalnızca SON DÖNEMDE kırmızı olanları filtrele
  const activeRedKpis = redKpis.filter(kpi => kpi.periodRecords[0]?.statusColor === 'RED');

  // 2. Açık Karşı Önlemleri (Countermeasures) bul
  const openCountermeasures = await prisma.countermeasure.findMany({
    where: { status: 'OPEN' },
    include: {
      kpi: true,
      ownerUser: true
    }
  });

  return { activeRedKpis, openCountermeasures };
}

// Toplantıda / İncelemede alınan bir kararı kaydeder
export async function createDecision(data: {
  reviewId: string,
  decisionText: string,
  dueDate?: Date,
  kpiId?: string,
  actionPlanId?: string,
  assigneeId?: string
}) {
  const decision = await prisma.decision.create({
    data: {
      reviewId: data.reviewId,
      decisionText: data.decisionText,
      status: 'OPEN',
      dueDate: data.dueDate,
      kpiId: data.kpiId,
      actionPlanId: data.actionPlanId,
      assigneeId: data.assigneeId
    }
  });

  revalidatePath("/meetings");
  revalidatePath("/reviews");
  return decision;
}
