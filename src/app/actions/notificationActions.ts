"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { notificationScopeFilter } from "@/lib/dataScope";
import { logEvent } from "@/lib/log";

export type ActionResult = { success: true } | { success: false; error: string };

/** Kullanıcının kendi bildirimleri (en yeni önce). Bildirimler her zaman kişiseldir (INV-4). */
export async function getMyNotifications() {
  const session = await getSession();
  if (!session?.userId) return [];
  return prisma.notificationLog.findMany({
    where: notificationScopeFilter({ id: session.userId, role: "", departmentId: null }),
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Okunmamış bildirim sayısı (kenar çubuğu rozeti için). */
export async function getUnreadCount(): Promise<number> {
  const session = await getSession();
  if (!session?.userId) return 0;
  return prisma.notificationLog.count({
    where: {
      ...notificationScopeFilter({ id: session.userId, role: "", departmentId: null }),
      readAt: null,
    },
  });
}

/** Tek bir bildirimi okundu işaretler. Yalnız kendi bildirimi (INV-4). */
export async function markRead(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  try {
    // userId koşulu kapsamı kendi bildirimleriyle sınırlar; başkasınınkini güncellemez.
    const res = await prisma.notificationLog.updateMany({
      where: { id, userId: session.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      // Zaten okunmuş ya da kapsam dışı — sessiz başarı değil, ama hata da değil.
      return { success: true };
    }
  } catch (e) {
    logEvent("error", "markRead.failed", {
      id,
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Bildirim güncellenemedi." };
  }
  revalidatePath("/notifications");
  return { success: true };
}

/** Tüm okunmamış bildirimleri okundu işaretler. */
export async function markAllRead(): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }
  try {
    await prisma.notificationLog.updateMany({
      where: { userId: session.userId, readAt: null },
      data: { readAt: new Date() },
    });
  } catch (e) {
    logEvent("error", "markAllRead.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "Bildirimler güncellenemedi." };
  }
  revalidatePath("/notifications");
  return { success: true };
}
