"use server";

/**
 * İçe aktarım sihirbazı sunucu aksiyonları (FR-43/44/45).
 * Etkin katman: yalnız bu dosya prisma'ya dokunabilir.
 * src/lib/import/* modülleri saf (I/O yok) kalmalıdır.
 */

import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { recordAudit } from "@/lib/engine/audit";
import { logEvent } from "@/lib/log";
import { sheetToRows, type RawRow } from "@/lib/import/parse";
import { defaultMapping, applyMapping, type ColumnMapping } from "@/lib/import/mapping";
import { normalizeRow } from "@/lib/import/normalize";
import {
  buildImportPlan,
  type ImportPlan,
  type ExistingIndex,
} from "@/lib/import/plan";

export type ActionResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// parseImportFile
// ---------------------------------------------------------------------------

export type ParseResult =
  | { success: true; headers: string[]; rows: RawRow[] }
  | { success: false; error: string };

/**
 * FormData'dan yüklenen Excel dosyasını ham satırlara dönüştürür.
 * Sadece okuma yapar; DB erişimi yoktur.
 */
export async function parseImportFile(formData: FormData): Promise<ParseResult> {
  try {
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "Dosya bulunamadı veya geçersiz." };
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { headers, rows } = sheetToRows(buffer);
    if (headers.length === 0) {
      return { success: false, error: "Dosya boş veya sütun başlıkları bulunamadı." };
    }
    return { success: true, headers, rows };
  } catch (e) {
    return {
      success: false,
      error: "Dosya okunamadı: " + (e instanceof Error ? e.message : String(e)),
    };
  }
}

// ---------------------------------------------------------------------------
// previewImport
// ---------------------------------------------------------------------------

/**
 * DB'deki tüm mevcut varlıkları yükleyerek ExistingIndex oluşturur.
 * Yalnız okuma yapar.
 */
async function loadExistingIndex(): Promise<ExistingIndex> {
  const [dbHoshins, dbDepts, dbMajorTasks, dbActionPlans, dbKpis] = await Promise.all([
    prisma.hoshin.findMany({ select: { id: true, title: true, year: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.majorTask.findMany({ select: { id: true, title: true, hoshinId: true } }),
    prisma.actionPlan.findMany({ select: { id: true, title: true, majorTaskId: true } }),
    prisma.kPI.findMany({
      select: {
        id: true,
        name: true,
        actionPlanId: true,
        targetYear: true,
        unit: true,
        reportingFrequency: true,
      },
    }),
  ]);

  const hoshins = new Map<string, { id: string }>();
  for (const h of dbHoshins) hoshins.set(`${h.title}|${h.year}`, { id: h.id });

  const departments = new Map<string, { id: string }>();
  for (const d of dbDepts) departments.set(d.name, { id: d.id });

  const majorTasks = new Map<string, { id: string }>();
  for (const mt of dbMajorTasks) majorTasks.set(`${mt.hoshinId}|${mt.title}`, { id: mt.id });

  const actionPlans = new Map<string, { id: string }>();
  for (const ap of dbActionPlans)
    actionPlans.set(`${ap.majorTaskId}|${ap.title}`, { id: ap.id });

  const kpis = new Map<string, { id: string; targetYear: number; unit: string; reportingFrequency: string }>();
  for (const kpi of dbKpis) {
    if (kpi.actionPlanId) {
      kpis.set(`${kpi.actionPlanId}|${kpi.name}`, {
        id: kpi.id,
        targetYear: kpi.targetYear,
        unit: kpi.unit,
        reportingFrequency: kpi.reportingFrequency,
      });
    }
  }

  return { hoshins, departments, majorTasks, actionPlans, kpis };
}

/**
 * Satırları + eşlemeyi alarak içe aktarım planını oluşturur (DB okuma, yazma yok).
 * previewImport ve commitImport aynı buildImportPlan fonksiyonunu kullandığından
 * önizlemede görülen şey commit'te gerçekleşen şeydir (INV-9).
 */
export async function previewImport(
  rows: RawRow[],
  mapping: ColumnMapping,
): Promise<ImportPlan> {
  const mapped = applyMapping(rows, mapping);
  const normalized = mapped.map(normalizeRow);
  const existing = await loadExistingIndex();
  const plan = buildImportPlan(normalized, existing);

  logEvent("info", "import.previewed", {
    creates: plan.creates.length,
    updates: plan.updates.length,
    dupes:   plan.dupes.length,
    errors:  plan.errors.length,
  });

  return plan;
}

// ---------------------------------------------------------------------------
// commitImport
// ---------------------------------------------------------------------------

export type CommitResult =
  | { success: true; created: number; updated: number; skipped: number }
  | { success: false; error: string };

/**
 * Önizleme planını tek bir transaction'da kalıcı hale getirir (INV-9).
 * Creates: tam hiyerarşi upsert + her yeni varlık için recordAudit.
 * Updates: yalnız KPI alanlarını güncelle.
 * Dupes: atla.
 * Herhangi bir satır başarısız → tüm batch geri alınır.
 * Guard: oturum yoksa → typed error, commit yok.
 */
export async function commitImport(plan: ImportPlan): Promise<CommitResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };
  }

  let created = 0;
  let updated = 0;
  const skipped = plan.dupes.length;

  try {
    await prisma.$transaction(async (tx) => {
      // Transaction içi önbellekler — aynı tx'te tekrar DB sorgusu atmaktan kaçınır
      const hoshinCache = new Map<string, string>(); // "title|year" → id
      const deptCache   = new Map<string, string>(); // name → id
      const mtCache     = new Map<string, string>(); // "hoshinId|title" → id
      const apCache     = new Map<string, string>(); // "majorTaskId|title" → id

      // --- Creates: tam hiyerarşi upsert ---
      for (const item of plan.creates) {
        const row = item.row;
        const deptName = row.departmentNames[0] ?? "Genel";

        // Departman upsert
        let deptId = deptCache.get(deptName);
        if (!deptId) {
          const dept = await tx.department.upsert({
            where: { name: deptName },
            update: {},
            create: { name: deptName },
          });
          deptId = dept.id;
          deptCache.set(deptName, deptId);
        }

        // Hoshin upsert
        const hoshinVKey = `${row.hoshinTitle}|${row.hoshinYear}`;
        let hoshinId = hoshinCache.get(hoshinVKey);
        if (!hoshinId) {
          const existing = await tx.hoshin.findFirst({
            where: { title: row.hoshinTitle, year: row.hoshinYear },
            select: { id: true },
          });
          if (existing) {
            hoshinId = existing.id;
          } else {
            const created_ = await tx.hoshin.create({
              data: {
                title:  row.hoshinTitle,
                year:   row.hoshinYear,
                type:   "ANNUAL",
                status: "ACTIVE",
              },
            });
            hoshinId = created_.id;
            await recordAudit(tx, {
              actorUserId: session.userId,
              action:      "CREATE",
              entityType:  "Hoshin",
              entityId:    hoshinId,
              summary:     `İçe aktarım: Hoshin oluşturuldu: ${row.hoshinTitle}`,
              context:     "commitImport",
            });
          }
          hoshinCache.set(hoshinVKey, hoshinId);
        }

        // MajorTask upsert
        const mtVKey = `${hoshinId}|${row.majorTaskTitle}`;
        let majorTaskId = mtCache.get(mtVKey);
        if (!majorTaskId) {
          const existing = await tx.majorTask.findFirst({
            where: { hoshinId, title: row.majorTaskTitle },
            select: { id: true },
          });
          if (existing) {
            majorTaskId = existing.id;
          } else {
            const created_ = await tx.majorTask.create({
              data: {
                title:    row.majorTaskTitle,
                hoshinId,
                priority: "MEDIUM",
                status:   "ACTIVE",
              },
            });
            majorTaskId = created_.id;
            await recordAudit(tx, {
              actorUserId: session.userId,
              action:      "CREATE",
              entityType:  "MajorTask",
              entityId:    majorTaskId,
              summary:     `İçe aktarım: Ana görev oluşturuldu: ${row.majorTaskTitle}`,
              context:     "commitImport",
            });
          }
          mtCache.set(mtVKey, majorTaskId);
        }

        // ActionPlan upsert
        const apVKey = `${majorTaskId}|${row.actionPlanTitle}`;
        let actionPlanId = apCache.get(apVKey);
        if (!actionPlanId) {
          const existing = await tx.actionPlan.findFirst({
            where: { majorTaskId, title: row.actionPlanTitle },
            select: { id: true },
          });
          if (existing) {
            actionPlanId = existing.id;
          } else {
            const created_ = await tx.actionPlan.create({
              data: {
                title:             row.actionPlanTitle,
                majorTaskId,
                responsibleDeptId: deptId,
                status:            "IN_PROGRESS",
                progressPercent:   0,
              },
            });
            actionPlanId = created_.id;
            await recordAudit(tx, {
              actorUserId: session.userId,
              action:      "CREATE",
              entityType:  "ActionPlan",
              entityId:    actionPlanId,
              summary:     `İçe aktarım: Aksiyon planı oluşturuldu: ${row.actionPlanTitle}`,
              context:     "commitImport",
            });
          }
          apCache.set(apVKey, actionPlanId);
        }

        // KPI create (plan bu satırı create olarak sınıflandırdı; güvenli oluştur)
        const existingKpi = await tx.kPI.findFirst({
          where: { actionPlanId, name: row.kpiName },
          select: { id: true },
        });
        if (existingKpi) {
          // Plan ve DB arasında yarış durumu — güvenli düşüş: güncelle
          await tx.kPI.update({
            where: { id: existingKpi.id },
            data: {
              targetYear:          row.targetValue,
              unit:                row.unit,
              reportingFrequency:  row.reportingFrequency,
            },
          });
          updated++;
        } else {
          const newKpi = await tx.kPI.create({
            data: {
              name:                row.kpiName,
              unit:                row.unit,
              targetYear:          row.targetValue,
              reportingFrequency:  row.reportingFrequency,
              actionPlanId,
              responsibleDeptId:   deptId,
            },
          });
          await recordAudit(tx, {
            actorUserId: session.userId,
            action:      "CREATE",
            entityType:  "KPI",
            entityId:    newKpi.id,
            summary:     `İçe aktarım: KPI oluşturuldu: ${row.kpiName}`,
            context:     "commitImport",
          });
          created++;
        }
      }

      // --- Updates: yalnız KPI alanlarını güncelle ---
      for (const item of plan.updates) {
        const row = item.row;
        await tx.kPI.update({
          where: { id: item.existingKpiId },
          data: {
            targetYear:         row.targetValue,
            unit:               row.unit,
            reportingFrequency: row.reportingFrequency,
          },
        });
        updated++;
      }
    });

    logEvent("info", "import.committed", { created, updated, skipped });
    revalidatePath("/");
    return { success: true, created, updated, skipped };
  } catch (e) {
    logEvent("error", "import.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { success: false, error: "İçe aktarım başarısız oldu. Lütfen tekrar deneyin." };
  }
}

export { defaultMapping };
