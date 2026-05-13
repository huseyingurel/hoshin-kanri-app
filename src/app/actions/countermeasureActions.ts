"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateCountermeasure(id: string, data: { rootCause?: string; actionSummary?: string; expectedImpact?: string; status?: string; closureNote?: string }) {
  const updatedCm = await prisma.countermeasure.update({
    where: { id },
    data
  });

  revalidatePath("/countermeasure");
  revalidatePath("/my-tasks");
  revalidatePath("/meetings");
  
  return updatedCm;
}
