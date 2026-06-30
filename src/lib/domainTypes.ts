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

/** Hoshin türleri (şemada inline yorumdaydı; tek kaynağa taşındı). */
export const HOSHIN_TYPES = ["BREAKTHROUGH", "ANNUAL"] as const;
export type HoshinType = (typeof HOSHIN_TYPES)[number];

/** Hoshin/MajorTask/ActionPlan yaşam döngüsü durumları. */
export const HOSHIN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type HoshinStatus = (typeof HOSHIN_STATUSES)[number];

/** Vizyon (True North) durumları (FR-01). */
export const VISION_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type VisionStatus = (typeof VISION_STATUSES)[number];

/** Adlandırılmış standart raporlar (FR-36). Export registry anahtarları. */
export const REPORT_KEYS = [
  "executiveOnePager", // İcra Kurulu tek-sayfa özeti
  "kpiStatus", // KPI durum tablosu (RAG)
  "redKpiCountermeasures", // RED KPI'lar + açık karşı önlemler
  "meetingMinutes", // toplantı tutanağı (reviewId gerekir)
  "hoshinProgress", // Hoshin ilerleme özeti
  "openDecisions", // açık kararlar
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_FORMATS = ["PDF", "XLSX"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const DECISION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

// --- Yönetişim katmanı (görev/bildirim/denetim/catchball) string sabitleri ---

/** Sistemin otomatik (veya elle) açtığı görev türleri. */
export const TASK_TYPES = [
  "PERIOD_ENTRY", // dönem açıldı, KPI girişi bekleniyor
  "DUE_SOON", // vade yaklaşıyor (T-3g)
  "OVERDUE_FOLLOWUP", // vadesi geçti
  "RED_KPI_REVIEW", // KPI RED → inceleme
  "CM_FOLLOWUP", // açık karşı önlem takibi
  "DECISION_FOLLOWUP", // toplantı kararı takibi
  "CATCHBALL_REVIEW", // catchball onay/revizyon talebi
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SOURCES = ["SYSTEM", "MANUAL"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/** Bildirim türleri — §11 tetikleyici matrisindeki olay adlarını yansıtır. */
export const NOTIFICATION_TYPES = [
  "PERIOD_OPENED",
  "DUE_SOON",
  "OVERDUE",
  "KPI_RED",
  "STRATEGIC_ESCALATION",
  "REVIEW_UPCOMING",
  "DECISION_ASSIGNED",
  "CM_OVERDUE",
  "CATCHBALL_REQUEST",
  "CATCHBALL_APPROVED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL"] as const; // yalnız IN_APP uygulanır; EMAIL ileride
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "TRANSITION",
  "LOCK",
  "REOPEN",
  "ESCALATE",
  "NOTIFY",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Catchball (top atışı) onay yaşam döngüsü. Yalnız APPROVED canlı incelemeye girer. */
export const CATCHBALL_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "REVISED",
  "AGREED",
  "APPROVED",
  "REJECTED",
] as const;
export type CatchballStatus = (typeof CATCHBALL_STATUSES)[number];

export const CATCHBALL_ITEM_TYPES = [
  "COMMENT",
  "REVISION_REQUEST",
  "COUNTER_PROPOSAL",
  "APPROVAL",
  "REJECTION",
] as const;
export type CatchballItemType = (typeof CATCHBALL_ITEM_TYPES)[number];

/** Catchball varlık tipleri (hangi nesneye iliştirildiği). */
export const CATCHBALL_ENTITY_TYPES = ["HOSHIN", "MAJOR_TASK", "ACTION_PLAN", "KPI"] as const;
export type CatchballEntityType = (typeof CATCHBALL_ENTITY_TYPES)[number];

/** KPI raporlama sıklığı — şema ile uyumlu (MONTHLY/QUARTERLY mevcuttu; yarıyıl/yıllık eklendi). */
export const REPORTING_FREQUENCIES = ["MONTHLY", "QUARTERLY", "HALF_YEAR", "ANNUAL"] as const;
export type ReportingFrequency = (typeof REPORTING_FREQUENCIES)[number];

// --- Tip koruyucular (guards) — sabit listelere karşı string doğrulama. ---

export const isHoshinType = (v: unknown): v is HoshinType =>
  typeof v === "string" && (HOSHIN_TYPES as readonly string[]).includes(v);
export const isHoshinStatus = (v: unknown): v is HoshinStatus =>
  typeof v === "string" && (HOSHIN_STATUSES as readonly string[]).includes(v);
export const isVisionStatus = (v: unknown): v is VisionStatus =>
  typeof v === "string" && (VISION_STATUSES as readonly string[]).includes(v);
export const isReportKey = (v: unknown): v is ReportKey =>
  typeof v === "string" && (REPORT_KEYS as readonly string[]).includes(v);
export const isReportFormat = (v: unknown): v is ReportFormat =>
  typeof v === "string" && (REPORT_FORMATS as readonly string[]).includes(v);
export const isReportingFrequency = (v: unknown): v is ReportingFrequency =>
  typeof v === "string" && (REPORTING_FREQUENCIES as readonly string[]).includes(v);
export const isKpiRagColor = (v: unknown): v is KpiRagColor =>
  typeof v === "string" && (KPI_RAG_COLORS as readonly string[]).includes(v);
