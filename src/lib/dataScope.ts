import type { Prisma } from "@prisma/client";
import { isOrgWideRole, usesDepartmentalDataScope } from "@/lib/access";
import type { ReportFilters } from "@/lib/export/filters";

export type UserScope = {
  id: string;
  role: string;
  departmentId: string | null;
};

/** KPI'lar: sahip veya departmanı atanmış kullanıcının sorumlu departmanı.
 * Departman üyeliği role bağlı değildir; kurum geneli roller de (ADMIN/PMO/EXECUTIVE)
 * "Benim KPI'larım" sayfasında kendi departmanlarının KPI'larını görür. Bu yalnızca
 * kapsamı genişletir (kullanıcının kendi departmanı), hiçbir rol için daraltmaz. */
export function personalKpiScopeFilter(u: UserScope): Prisma.KPIWhereInput {
  const or: Prisma.KPIWhereInput[] = [{ ownerUserId: u.id }];
  if (u.departmentId) {
    or.push({ responsibleDeptId: u.departmentId });
  }
  return { OR: or };
}

/** Dashboard / rapor: kurum geneli rollerde filtre yok. */
export function kpiScopeFilter(u: UserScope): Prisma.KPIWhereInput | undefined {
  if (isOrgWideRole(u.role)) return undefined;
  return personalKpiScopeFilter(u);
}

export function hoshinScopeFilter(u: UserScope): Prisma.HoshinWhereInput | undefined {
  if (isOrgWideRole(u.role)) return undefined;
  const apOr: Prisma.ActionPlanWhereInput[] = [
    { ownerUserId: u.id },
    { kpis: { some: { ownerUserId: u.id } } },
  ];
  if (usesDepartmentalDataScope(u.role, u.departmentId) && u.departmentId) {
    apOr.push({ responsibleDeptId: u.departmentId });
    apOr.push({ kpis: { some: { responsibleDeptId: u.departmentId } } } );
  }
  return {
    majorTasks: {
      some: {
        actionPlans: { some: { OR: apOr } },
      },
    },
  };
}

export function countermeasureOpenScopeFilter(u: UserScope): Prisma.CountermeasureWhereInput {
  const base: Prisma.CountermeasureWhereInput = { status: "OPEN" };
  const kpiFilter = kpiScopeFilter(u);
  if (!kpiFilter) return base;
  return {
    AND: [
      base,
      {
        OR: [{ ownerUserId: u.id }, { kpi: kpiFilter }],
      },
    ],
  };
}

export function actionPlanMyTasksFilter(u: UserScope): Prisma.ActionPlanWhereInput {
  const or: Prisma.ActionPlanWhereInput[] = [{ ownerUserId: u.id }];
  if (usesDepartmentalDataScope(u.role, u.departmentId) && u.departmentId) {
    or.push({ responsibleDeptId: u.departmentId });
  }
  return {
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    OR: or,
  };
}

export function countermeasureMyTasksFilter(u: UserScope): Prisma.CountermeasureWhereInput {
  const or: Prisma.CountermeasureWhereInput[] = [{ ownerUserId: u.id }];
  if (usesDepartmentalDataScope(u.role, u.departmentId) && u.departmentId) {
    or.push({ kpi: { responsibleDeptId: u.departmentId } });
  }
  return {
    status: "OPEN",
    OR: or,
  };
}

/** Karşı önlemler listesi: kurum geneli hariç sahip veya kapsamdaki KPI ile ilişkili kayıtlar. */
export function countermeasureListScopeFilter(u: UserScope): Prisma.CountermeasureWhereInput | undefined {
  if (isOrgWideRole(u.role)) return undefined;
  return {
    OR: [{ ownerUserId: u.id }, { kpi: personalKpiScopeFilter(u) }],
  };
}

/** Görevler: kurum geneli roller hepsini görür; departman kapsamlı roller kendine veya
 * departmanına atanmış görevleri görür. Yalnız kapsamı genişletir, hiçbir rol için daraltmaz
 * (INV-4). Durum/öncelik gibi ek koşulları çağıran ekler. */
export function taskScopeFilter(u: UserScope): Prisma.TaskWhereInput | undefined {
  if (isOrgWideRole(u.role)) return undefined;
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: u.id }];
  if (usesDepartmentalDataScope(u.role, u.departmentId) && u.departmentId) {
    or.push({ assigneeDeptId: u.departmentId });
  }
  return { OR: or };
}

/** Bildirimler kişiseldir: her kullanıcı yalnız kendi bildirimlerini görür — en dar kapsam.
 * Kurum geneli roller bile başkalarının bildirimlerini görmez (INV-4: asla genişletilmez). */
export function notificationScopeFilter(u: UserScope): Prisma.NotificationLogWhereInput {
  return { userId: u.id };
}

// --- Rapor/arşiv filtre besteci (FR-37/FR-42) ---
// Tüm besteleme AND iledir: bir filtre kapsamı yalnız DARALTIR, asla genişletmez (INV-4/INV-8).

/** Hoshin sorgusuna yıl daraltması ekler (FR-42 arşiv navigasyonu). */
export function withYear(
  where: Prisma.HoshinWhereInput | undefined,
  year?: number,
): Prisma.HoshinWhereInput | undefined {
  if (year == null) return where;
  return where ? { AND: [where, { year }] } : { year };
}

export interface ReportScopeBundle {
  /** Kapsam ∧ departman filtresi (KPI sorguları için). org-wide + filtresiz → undefined. */
  kpiWhere: Prisma.KPIWhereInput | undefined;
  /** Kapsam ∧ yıl ∧ hoshinId filtresi (Hoshin sorguları için). */
  hoshinWhere: Prisma.HoshinWhereInput | undefined;
}

/**
 * Rol kapsam filtrelerini rapor filtreleriyle (yıl/dept/hoshin) AND-besteler.
 * `color` burada uygulanmaz — son dönem kaydına bağlı olduğu için rapor modülü veri
 * düzeyinde süzer. Döndürülen where'ler yalnız mevcut kapsamı daraltır.
 */
export function reportScopeBundle(u: UserScope, filters: ReportFilters): ReportScopeBundle {
  const kpiAnd: Prisma.KPIWhereInput[] = [];
  const kpiBase = kpiScopeFilter(u);
  if (kpiBase) kpiAnd.push(kpiBase);
  if (filters.deptId) kpiAnd.push({ responsibleDeptId: filters.deptId });
  const kpiWhere = kpiAnd.length ? { AND: kpiAnd } : undefined;

  const hoshinAnd: Prisma.HoshinWhereInput[] = [];
  const hoshinBase = hoshinScopeFilter(u);
  if (hoshinBase) hoshinAnd.push(hoshinBase);
  if (filters.year != null) hoshinAnd.push({ year: filters.year });
  if (filters.hoshinId) hoshinAnd.push({ id: filters.hoshinId });
  const hoshinWhere = hoshinAnd.length ? { AND: hoshinAnd } : undefined;

  return { kpiWhere, hoshinWhere };
}
