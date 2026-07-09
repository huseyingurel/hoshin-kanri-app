"use server";

/**
 * FR-04 (şablondan çoğaltma): mevcut bir Hoshin'i şablon olarak alıp tüm alt ağacıyla
 * (MajorTask → ActionPlan → KPI) yeni bir taslak Hoshin'e kopyalar. İşletimsel veriler
 * (dönem kayıtları, karşı önlemler, kararlar, görevler, catchball) KOPYALANMAZ — yalnız
 * planlama iskeleti çoğaltılır ve durumlar taslağa döndürülür.
 *
 * Her çoğaltma: oturum + yetki denetimi (yalnız kurum geneli roller) → tek `$transaction`
 * içinde derin kopya + `recordAudit` (action `"CREATE"`) → `strategy.duplicated` log olayı.
 */

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isOrgWideRole } from "@/lib/access";
import { recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";
import type { UserScope } from "@/lib/dataScope";
import type { Prisma } from "@prisma/client";

export type ActionResult =
  | { success: true; hoshinId: string }
  | { success: false; error: string };

async function getActorScope(): Promise<UserScope | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  return dbUser ?? null;
}

/**
 * Aynı yıl içinde `title` benzersizdir (@@unique([title, year])). Kopya için çakışmayan bir
 * başlık üretir: "{title} (Kopya)", sonra "(Kopya 2)", "(Kopya 3)"…
 */
async function uniqueCopyTitle(
  tx: Prisma.TransactionClient,
  baseTitle: string,
  year: number,
): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "(Kopya)" : `(Kopya ${n})`;
    const candidate = `${baseTitle} ${suffix}`;
    const clash = await tx.hoshin.findFirst({
      where: { title: candidate, year },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Aşırı durum: benzersiz kalması için zaman damgası ekle.
  return `${baseTitle} (Kopya ${Date.now()})`;
}

/**
 * Bir Hoshin'i şablon olarak yeni bir taslak Hoshin'e çoğaltır (FR-04).
 * Yetki: yalnız kurum geneli roller (ADMIN / PMO / EXECUTIVE).
 */
export async function duplicateHoshin(hoshinId: string): Promise<ActionResult> {
  const scope = await getActorScope();
  if (!scope) return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  if (!isOrgWideRole(scope.role)) {
    return { success: false, error: "Yalnızca kurum geneli roller hoshin çoğaltabilir." };
  }

  try {
    const newId = await prisma.$transaction(async (tx) => {
      const source = await tx.hoshin.findUniqueOrThrow({
        where: { id: hoshinId },
        include: {
          majorTasks: {
            include: {
              actionPlans: {
                include: { kpis: true },
              },
            },
          },
        },
      });

      const title = await uniqueCopyTitle(tx, source.title, source.year);

      // Yeni Hoshin: durumlar taslağa döner; vizyon + sponsor bağlantıları korunur.
      const clone = await tx.hoshin.create({
        data: {
          title,
          description: source.description,
          year: source.year,
          type: source.type,
          status: "DRAFT",
          catchballStatus: "DRAFT",
          sponsorUserId: source.sponsorUserId,
          visionId: source.visionId,
        },
      });

      for (const mt of source.majorTasks) {
        const mtClone = await tx.majorTask.create({
          data: {
            title: mt.title,
            description: mt.description,
            priority: mt.priority,
            status: "DRAFT",
            catchballStatus: "DRAFT",
            hoshinId: clone.id,
          },
        });

        for (const ap of mt.actionPlans) {
          const apClone = await tx.actionPlan.create({
            data: {
              title: ap.title,
              description: ap.description,
              startDate: ap.startDate,
              dueDate: ap.dueDate,
              progressPercent: 0,
              status: "NOT_STARTED",
              catchballStatus: "DRAFT",
              majorTaskId: mtClone.id,
              ownerUserId: ap.ownerUserId,
              responsibleDeptId: ap.responsibleDeptId,
            },
          });

          for (const kpi of ap.kpis) {
            // KPI planlama iskeleti kopyalanır; dönem kayıtları/karşı önlemler alınmaz.
            await tx.kPI.create({
              data: {
                name: kpi.name,
                definition: kpi.definition,
                unit: kpi.unit,
                targetYear: kpi.targetYear,
                reportingFrequency: kpi.reportingFrequency,
                catchballStatus: "DRAFT",
                redThreshold: kpi.redThreshold,
                amberThreshold: kpi.amberThreshold,
                actionPlanId: apClone.id,
                ownerUserId: kpi.ownerUserId,
                responsibleDeptId: kpi.responsibleDeptId,
              },
            });
          }
        }
      }

      const mtCount = source.majorTasks.length;
      const apCount = source.majorTasks.reduce((s, mt) => s + mt.actionPlans.length, 0);
      const kpiCount = source.majorTasks.reduce(
        (s, mt) => s + mt.actionPlans.reduce((a, ap) => a + ap.kpis.length, 0),
        0,
      );

      await recordAudit(tx, {
        actorUserId: scope.id,
        action: "CREATE",
        entityType: "Hoshin",
        entityId: clone.id,
        summary: `Hoshin şablondan çoğaltıldı: "${source.title}" → "${title}" (${mtCount} ana görev, ${apCount} aksiyon planı, ${kpiCount} KPI)`,
        context: "duplicateHoshin",
      });
      logEvent("info", "strategy.duplicated", {
        sourceId: hoshinId,
        newId: clone.id,
        majorTasks: mtCount,
        actionPlans: apCount,
        kpis: kpiCount,
      });

      return clone.id;
    }, { timeout: 20000 }); // derin ağaç çok sayıda ardışık insert içerir — varsayılan 5s'i aşabilir

    revalidatePath("/strategy");
    return { success: true, hoshinId: newId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent("error", "duplicateHoshin.failed", { hoshinId, message: msg });
    return { success: false, error: "Hoshin çoğaltılamadı. Lütfen tekrar deneyin." };
  }
}
