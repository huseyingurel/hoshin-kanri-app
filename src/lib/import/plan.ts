/**
 * İçe aktarım planı oluşturur: normalize edilmiş satırları doğal anahtarlarla
 * mevcut DB indeksine karşı karşılaştırır; create/update/dupe/error olarak sınıflandırır.
 *
 * Yinelenen oluşturma hatasını düzeltir (import-excel.ts'deki bug):
 * MajorTask, ActionPlan, KPI her zaman .create() ile yaratılıyordu — doğal anahtar
 * eşleşmesi yoktu. Bu modül doğal anahtarla eşleşir ve yalnız gerçekten yeni olanları
 * creates dizisine koyar.
 *
 * SAF modül: I/O yok, prisma yok.
 */

import type { NormalizedRow, RowError } from "./normalize";

/** DB'deki mevcut KPI kaydı (plan sınıflandırması için). */
export interface ExistingKpiRecord {
  id: string;
  targetYear: number;
  unit: string;
  reportingFrequency: string;
}

/**
 * importActions.ts tarafından prisma'dan yüklenerek buildImportPlan'a geçilir.
 * Map anahtarları sabit formüller:
 *   hoshins:     "title|year"
 *   departments: "name"
 *   majorTasks:  "hoshinId|title"    (gerçek DB hoshinId)
 *   actionPlans: "majorTaskId|title" (gerçek DB majorTaskId)
 *   kpis:        "actionPlanId|name" (gerçek DB actionPlanId)
 */
export interface ExistingIndex {
  hoshins:     Map<string, { id: string }>;
  departments: Map<string, { id: string }>;
  majorTasks:  Map<string, { id: string }>;
  actionPlans: Map<string, { id: string }>;
  kpis:        Map<string, ExistingKpiRecord>;
}

export interface PlanCreate {
  kind: "create";
  row: NormalizedRow;
}

export interface PlanUpdate {
  kind: "update";
  row: NormalizedRow;
  existingKpiId: string;
}

/** Dupe: KPI zaten var ve alanlar aynı (atlanacak); ya da aynı içe aktarım dosyasında yineleniyor. */
export interface PlanDupe {
  kind: "dupe";
  row: NormalizedRow;
  /** Mevcut DB KPI kimliği; toplu-yineleme için "__batch_dupe__". */
  existingKpiId: string;
}

export interface ImportPlan {
  creates: PlanCreate[];
  updates: PlanUpdate[];
  dupes:   PlanDupe[];
  errors:  RowError[];
}

/**
 * Normalize edilmiş satırları (ya da satır hatalarını) mevcut DB indeksine karşı sınıflandırır.
 *
 * Sınıflandırma mantığı:
 * 1. RowError → errors
 * 2. Aynı içe aktarım dosyasında yinelenen (virtualKey) → dupe
 * 3. KPI DB'de yok → create
 * 4. KPI DB'de var, alanlar değişmemiş → dupe
 * 5. KPI DB'de var, alanlar farklı → update
 */
export function buildImportPlan(
  normalized: Array<NormalizedRow | RowError>,
  existing: ExistingIndex,
): ImportPlan {
  const creates: PlanCreate[] = [];
  const updates: PlanUpdate[] = [];
  const dupes:   PlanDupe[]   = [];
  const errors:  RowError[]   = [];

  // Toplu yineleme tespiti için tam doğal anahtar zinciri
  const seenVirtualKeys = new Set<string>();

  for (const item of normalized) {
    if (item.kind === "error") {
      errors.push(item);
      continue;
    }

    const row = item;

    // Toplu yineleme: dosya içinde aynı KPI iki kez görünüyor
    const virtualKey = `${row.hoshinTitle}|${row.hoshinYear}|${row.majorTaskTitle}|${row.actionPlanTitle}|${row.kpiName}`;
    if (seenVirtualKeys.has(virtualKey)) {
      dupes.push({ kind: "dupe", row, existingKpiId: "__batch_dupe__" });
      continue;
    }
    seenVirtualKeys.add(virtualKey);

    // Hiyerarşiyi takip ederek KPI'yı DB'de ara
    const hoshinKey = `${row.hoshinTitle}|${row.hoshinYear}`;
    const existingHoshin = existing.hoshins.get(hoshinKey);
    if (!existingHoshin) {
      creates.push({ kind: "create", row });
      continue;
    }

    const mtKey = `${existingHoshin.id}|${row.majorTaskTitle}`;
    const existingMt = existing.majorTasks.get(mtKey);
    if (!existingMt) {
      creates.push({ kind: "create", row });
      continue;
    }

    const apKey = `${existingMt.id}|${row.actionPlanTitle}`;
    const existingAp = existing.actionPlans.get(apKey);
    if (!existingAp) {
      creates.push({ kind: "create", row });
      continue;
    }

    const kpiKey = `${existingAp.id}|${row.kpiName}`;
    const existingKpi = existing.kpis.get(kpiKey);
    if (!existingKpi) {
      creates.push({ kind: "create", row });
      continue;
    }

    // KPI mevcut — alanlar aynı mı?
    const isIdentical =
      existingKpi.targetYear === row.targetValue &&
      existingKpi.unit === row.unit &&
      existingKpi.reportingFrequency === row.reportingFrequency;

    if (isIdentical) {
      dupes.push({ kind: "dupe", row, existingKpiId: existingKpi.id });
    } else {
      updates.push({ kind: "update", row, existingKpiId: existingKpi.id });
    }
  }

  return { creates, updates, dupes, errors };
}
