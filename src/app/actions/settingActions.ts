"use server";

import { canManageSettings } from "@/lib/access";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireSettingsManager() {
  const session = await getSession();
  if (!session?.userId) {
    throw new Error("Oturum gerekli.");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });

  if (!dbUser || !canManageSettings(dbUser.role)) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
}

export async function getRagSettings() {
  const amberSetting = await prisma.systemSetting.findUnique({ where: { key: 'RAG_AMBER_THRESHOLD' } });
  const redSetting = await prisma.systemSetting.findUnique({ where: { key: 'RAG_RED_THRESHOLD' } });

  // Eğer ayar yoksa varsayılan değerleri döndür ve oluştur
  const amber = amberSetting ? parseFloat(amberSetting.value) : -5;
  const red = redSetting ? parseFloat(redSetting.value) : -10;

  if (!amberSetting) {
    await prisma.systemSetting.create({ data: { key: 'RAG_AMBER_THRESHOLD', value: '-5', description: 'Sarı statüye düşmek için gereken min % sapma' } });
  }
  if (!redSetting) {
    await prisma.systemSetting.create({ data: { key: 'RAG_RED_THRESHOLD', value: '-10', description: 'Kırmızı statüye düşmek için gereken min % sapma' } });
  }

  return { amberThreshold: amber, redThreshold: red };
}

export async function updateRagSettings(amber: number, red: number) {
  await requireSettingsManager();

  await prisma.systemSetting.upsert({
    where: { key: 'RAG_AMBER_THRESHOLD' },
    update: { value: amber.toString() },
    create: { key: 'RAG_AMBER_THRESHOLD', value: amber.toString(), description: 'Sarı statüye düşmek için gereken min % sapma' }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'RAG_RED_THRESHOLD' },
    update: { value: red.toString() },
    create: { key: 'RAG_RED_THRESHOLD', value: red.toString(), description: 'Kırmızı statüye düşmek için gereken min % sapma' }
  });

  revalidatePath("/settings");
  revalidatePath("/data-entry");
  return { success: true };
}
