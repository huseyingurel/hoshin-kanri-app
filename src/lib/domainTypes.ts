/** Tek kaynak: roller ve sık kullanılan durum string’leri (Prisma şeması ile uyumlu). */

export const ORG_WIDE_ROLES = ["ADMIN", "PMO", "EXECUTIVE"] as const;
export type OrgWideRole = (typeof ORG_WIDE_ROLES)[number];

export const DEPARTMENT_SCOPED_ROLES = ["DEPT_HEAD", "KPI_OWNER", "USER"] as const;
export type DepartmentScopedRole = (typeof DEPARTMENT_SCOPED_ROLES)[number];

export const KPI_RAG_COLORS = ["GREEN", "AMBER", "RED"] as const;
export type KpiRagColor = (typeof KPI_RAG_COLORS)[number];

export const ACTION_PLAN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"] as const;
export type ActionPlanStatus = (typeof ACTION_PLAN_STATUSES)[number];

export const COUNTERMEASURE_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type CountermeasureStatus = (typeof COUNTERMEASURE_STATUSES)[number];

export const REVIEW_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DECISION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
