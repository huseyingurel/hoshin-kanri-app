/**
 * Collections adapter — the emploid.ai data layer for the Hoshin migration.
 *
 * This is the tracer bullet's data seam: it exposes exactly the operations the
 * `saveKpiRecord` write path needs, backed by the emploid **Collections** service
 * (`com.appconda.service.emploid/collection/*`) instead of Prisma/Postgres. Every
 * method here has a Prisma counterpart in the POC; the mapping was proven at the API
 * level by the 2026-07-09 spike (see `docs/plans/tracer-bullet-productionize.md`).
 *
 * Design notes that will bite you if ignored:
 *  - There is **no multi-record transaction**. Callers sequence writes deterministically
 *    and rely on idempotent dedup (period record first = source of truth; countermeasure /
 *    task / notification dedup against an existing key). A retry after a partial failure
 *    converges rather than duplicates.
 *  - `QueryRecords`' structured filter is **inert** in this build. The only working
 *    server-side filter is `SearchRecords {fields, q}` — a per-field *substring* match.
 *    So every scoped read fetches a candidate set by substring and **refines exactly in JS**.
 *  - FKs are scalar `*Id` STRING columns; joins happen here in the logic layer.
 *  - Record `data` is written as a *stringified* JSON object keyed by physical field name,
 *    and read back as a real object under `items[].data`.
 *  - `dedupeKey @unique` is not enforced by the platform, so idempotency is enforced here
 *    (find-by-key then create) — same shape as the POC's engine helpers.
 */
import type { KpiRagColor } from "@/lib/domainTypes";
import type { FieldChange } from "@/lib/engine/audit";

// --- Configuration -------------------------------------------------------------

const TENANT_ID = process.env.EMPLOID_TENANT_ID ?? "cmr0nksq60fm9nx6058o5nkfo";
const DATA_MODEL_ID =
  process.env.EMPLOID_DATA_MODEL_ID ?? "ce4b8ff0-3e78-49e0-9ca0-1eb7b1e48092";
const API_ORIGIN = process.env.EMPLOID_API_ORIGIN ?? "https://app.emploid.ai";
const REGISTRY_BASE = `${API_ORIGIN}/api/appconda/v1/service/registry/com.appconda.service.emploid/collection/`;

/**
 * Server-to-server credential. TODO(tracer): the platform's `apikey`-create endpoint is
 * broken (returns 200, persists nothing), so the only working auth today is a user
 * **session cookie**. Supply the full cookie string (e.g.
 * `__Secure-next-auth.session-token=...`) via `EMPLOID_SESSION_COOKIE`. This is an
 * insecure stopgap, documented as such; productionizing needs a real service credential.
 */
const SESSION_COOKIE = process.env.EMPLOID_SESSION_COOKIE ?? "";

/** Physical collection ids in the `hoshin_kanri_poc` data model. */
export const COLLECTIONS = {
  appUser: "1946bcfa-e819-4b37-b540-c44266da1461",
  kpi: "56f93ec6-5e16-4a5d-9294-bafeff822ea3",
  kpiPeriodRecord: "bb32777e-502d-447c-b77d-c582927e378f",
  countermeasure: "fe018c5c-820d-4573-b1fa-7af82379927a",
  systemSetting: "d20dd983-a994-43c0-8de2-4c7c47a183f1",
  auditLog: "3c7bee8f-9941-4269-99de-aec677d449b2",
  task: "cff557f0-e8dd-4754-b4e8-a242aab3f64a",
  notificationLog: "79f0548f-9407-40d1-89cb-23f93bb99acc",
  // Strategy tree — walked only for level-2 escalation (sponsor resolution).
  actionPlan: "f66f0d3e-d199-4539-9e0e-f789a7241b15",
  majorTask: "e1598121-c10e-46c8-9520-fce132cbb8d7",
  hoshin: "4d195269-a452-49c6-9867-14391e616c8a",
} as const;

// --- RPC envelope --------------------------------------------------------------

/** A Collections record as returned by the read methods. */
export interface CollectionRecord<T = Record<string, unknown>> {
  id: string;
  data: T;
  meta?: Record<string, unknown>;
}

class CollectionsError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(`Collections ${method} failed (${status}): ${JSON.stringify(detail)}`);
    this.name = "CollectionsError";
  }
}

async function rpc<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(REGISTRY_BASE + method, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-appconda-project": "console",
      "x-appconda-response-format": "1.6.0",
      ...(SESSION_COOKIE ? { cookie: SESSION_COOKIE } : {}),
    },
    body: JSON.stringify({ tenantId: TENANT_ID, ...body }),
    // Server-to-server; never send ambient browser credentials.
    cache: "no-store",
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* some methods (notably DeleteRecord) return a non-JSON / 500-on-success body */
  }

  // DeleteRecord returns HTTP 500 even on success; callers that must delete verify via a
  // follow-up count. Every other method treats a non-2xx as a real error.
  if (!res.ok) {
    throw new CollectionsError(method, res.status, parsed);
  }
  return parsed as T;
}

interface ListResponse<T> {
  total?: number;
  limit?: number;
  offset?: number;
  items?: CollectionRecord<T>[];
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 1000; // backstop against an unbounded loop

/**
 * Reads every page of a `ListRecords`/`SearchRecords` result, de-duplicated by record id.
 *
 * The default page (no `limit`) would silently truncate large result sets — for the dedup
 * reads that back this adapter's idempotency (open-countermeasure lookup, task/notification
 * dedup, lock check) a truncated page is a correctness bug, not just a perf one. So we
 * page explicitly on `offset`. The "no new ids this page" guard makes this safe even on a
 * build that ignores `offset` (it would re-return page 1 forever): we stop instead of
 * looping, degrading to first-page coverage rather than hanging.
 */
async function fetchAllPages<T>(
  method: "ListRecords" | "SearchRecords",
  baseBody: Record<string, unknown>,
): Promise<CollectionRecord<T>[]> {
  const byId = new Map<string, CollectionRecord<T>>();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    // `limit`/`offset` MUST be strings — SearchRecords rejects numeric values with
    // "Invalid limit: Value must be a valid string" (verified live 2026-07-09). Same
    // string-typed-arg quirk as `data`/`query` elsewhere on this service.
    const res = await rpc<ListResponse<T>>(method, {
      ...baseBody,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const items = res.items ?? [];
    if (items.length === 0) break;
    const sizeBefore = byId.size;
    for (const item of items) byId.set(item.id, item);
    // Stop on: a short (final) page; a page that added nothing new (offset ignored / fully
    // overlapping — prevents an infinite loop); or having reached a server-reported total.
    // When `total` is absent we keep going until a short/empty page, so an exact multiple of
    // PAGE_LIMIT is not truncated.
    if (items.length < PAGE_LIMIT) break;
    if (byId.size === sizeBefore) break;
    if (typeof res.total === "number" && byId.size >= res.total) break;
    offset += PAGE_LIMIT;
  }
  return [...byId.values()];
}

/** All rows of a collection (the filter arg on `QueryRecords` is inert, so we page all). */
async function listRecords<T = Record<string, unknown>>(
  collectionId: string,
): Promise<CollectionRecord<T>[]> {
  return fetchAllPages<T>("ListRecords", { collectionId });
}

/**
 * Server-side substring filter, unioned across (field,value) pairs. Because `SearchRecords`
 * is a substring match, callers MUST refine exactly in JS. Returns the raw candidate set,
 * fully paged and de-duplicated by record id.
 */
async function searchUnion<T = Record<string, unknown>>(
  collectionId: string,
  queries: ReadonlyArray<{ fields: string[]; q: string }>,
): Promise<CollectionRecord<T>[]> {
  const byId = new Map<string, CollectionRecord<T>>();
  for (const { fields, q } of queries) {
    if (!q) continue;
    const items = await fetchAllPages<T>("SearchRecords", { collectionId, fields, q });
    for (const item of items) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/** True when a 500 body indicates a missing/soft-deleted target (vs. a real server error). */
function isNotFoundDetail(detail: unknown): boolean {
  const s = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
  return /not found|already deleted|does not exist/i.test(s);
}

async function getRecordById<T = Record<string, unknown>>(
  collectionId: string,
  recordId: string,
): Promise<CollectionRecord<T> | null> {
  try {
    const r = await rpc<CollectionRecord<T>>("GetRecordById", {
      collectionId,
      recordId,
    });
    return r?.id ? r : null;
  } catch (e) {
    // A soft-deleted / unknown id returns 500 "Record not found or already deleted" — that
    // is a legitimate "no record". Any OTHER 500 (auth, transport, server) is a real failure
    // and must propagate, so callers fail loudly instead of silently reading `null` (which
    // here would masquerade as "user/KPI not found").
    if (e instanceof CollectionsError && e.status === 500 && isNotFoundDetail(e.detail)) {
      return null;
    }
    throw e;
  }
}

async function createRecord<T extends Record<string, unknown>>(
  collectionId: string,
  data: T,
): Promise<string> {
  const r = await rpc<CollectionRecord>("CreateRecord", {
    collectionId,
    dataModelId: DATA_MODEL_ID,
    data: JSON.stringify(data),
  });
  // Guard the silent-bad-write case: a 2xx with no record id would otherwise return
  // `undefined` and let downstream rows reference a non-existent entity.
  if (!r?.id) {
    throw new CollectionsError("CreateRecord", 200, r ?? "empty response (no record id)");
  }
  return r.id;
}

// --- Domain shapes (what callers see; joins already resolved) ------------------

export interface AppUser {
  id: string;
  role: string;
  departmentId: string | null;
  email: string;
}

export interface KpiDetails {
  id: string;
  name: string;
  ownerUserId: string | null;
  responsibleDeptId: string | null;
  reportingFrequency: string | null;
  redThreshold: number | null;
  amberThreshold: number | null;
  actionPlanId: string | null;
}

export interface PeriodRecordInput {
  kpiId: string;
  periodStart: Date;
  periodEnd: Date;
  targetValue: number;
  actualValue: number;
  variance: number;
  statusColor: KpiRagColor;
  ownerComment: string;
  varianceReason: string | null;
  evidenceUrl: string | null;
  submittedById: string;
}

// --- Field mappers -------------------------------------------------------------

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}
/** Coerce a Collections boolean field, tolerating a stringified `"true"`/`"false"`. */
function bool(v: unknown): boolean {
  return v === true || v === "true";
}

function toAppUser(r: CollectionRecord): AppUser {
  const d = r.data;
  return {
    id: r.id,
    role: String(d.usr_role ?? ""),
    departmentId: str(d.usr_departmentId),
    email: String(d.usr_email ?? ""),
  };
}

function toKpiDetails(r: CollectionRecord): KpiDetails {
  const d = r.data;
  return {
    id: r.id,
    name: String(d.kpi_name ?? ""),
    ownerUserId: str(d.kpi_ownerUserId),
    responsibleDeptId: str(d.kpi_responsibleDeptId),
    reportingFrequency: str(d.kpi_reportingFrequency),
    redThreshold: num(d.kpi_redThreshold),
    amberThreshold: num(d.kpi_amberThreshold),
    actionPlanId: str(d.kpi_actionPlanId),
  };
}

// --- Read operations (Prisma counterparts in comments) -------------------------

/** `prisma.user.findUnique({ where: { id } })` */
export async function getUserById(userId: string): Promise<AppUser | null> {
  const r = await getRecordById(COLLECTIONS.appUser, userId);
  return r ? toAppUser(r) : null;
}

/** `prisma.user.findMany({ where: { role } })` — substring search refined to an exact role. */
export async function findUsersByRole(role: string): Promise<AppUser[]> {
  const candidates = await searchUnion(COLLECTIONS.appUser, [
    { fields: ["usr_role"], q: role },
  ]);
  return candidates.map(toAppUser).filter((u) => u.role === role);
}

/**
 * `prisma.kPI.findFirst({ where: { id, ...kpiScopeFilter(scope) } })`.
 *
 * The POC scope is "owner OR same responsible department". We fetch the KPI by id and
 * check the scope predicate in JS — a point-read + predicate is both cheaper and more
 * exact than a `SearchRecords` union here, since we already know the target id.
 * `scopeOwnerId`/`scopeDeptId` are null for org-wide roles (no filter → always allowed).
 */
export async function findKpiInScope(
  kpiId: string,
  scope: { ownerUserId: string | null; departmentId: string | null } | null,
): Promise<KpiDetails | null> {
  const r = await getRecordById(COLLECTIONS.kpi, kpiId);
  if (!r) return null;
  const kpi = toKpiDetails(r);
  if (scope === null) return kpi; // org-wide role: no row-level filter
  const allowed =
    (scope.ownerUserId !== null && kpi.ownerUserId === scope.ownerUserId) ||
    (scope.departmentId !== null && kpi.responsibleDeptId === scope.departmentId);
  return allowed ? kpi : null;
}

/** `prisma.kPI.findUnique({ where: { id } })` */
export async function getKpiById(kpiId: string): Promise<KpiDetails | null> {
  const r = await getRecordById(COLLECTIONS.kpi, kpiId);
  return r ? toKpiDetails(r) : null;
}

/** Sponsor of the KPI's hoshin, resolved by walking the scalar FK chain. */
export async function getHoshinSponsorForKpi(
  actionPlanId: string | null,
): Promise<string | null> {
  if (!actionPlanId) return null;
  try {
    // FK walk kpi → action_plan → major_task → hoshin. The sponsor is an OPTIONAL escalation
    // recipient, so any missing link OR lookup error degrades to "no sponsor" — it must never
    // fail the save (the PMO recipients are resolved separately and still notified).
    const ap = await getRecordById(COLLECTIONS.actionPlan, actionPlanId);
    const majorTaskId = str(ap?.data.aplan_majorTaskId);
    if (!majorTaskId) return null;
    const mt = await getRecordById(COLLECTIONS.majorTask, majorTaskId);
    const hoshinId = str(mt?.data.mtask_hoshinId);
    if (!hoshinId) return null;
    const h = await getRecordById(COLLECTIONS.hoshin, hoshinId);
    return str(h?.data.hsh_sponsorUserId);
  } catch {
    return null;
  }
}

/** `settingActions.getRagSettings()` — key/value map from `hk_system_setting`. */
export async function getRagThresholds(): Promise<{
  amberThreshold: number;
  redThreshold: number;
}> {
  const rows = await listRecords(COLLECTIONS.systemSetting);
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = str(r.data.sset_key);
    if (key) map.set(key, String(r.data.sset_value ?? ""));
  }
  const amber = map.has("RAG_AMBER_THRESHOLD")
    ? parseFloat(map.get("RAG_AMBER_THRESHOLD")!)
    : -5;
  const red = map.has("RAG_RED_THRESHOLD")
    ? parseFloat(map.get("RAG_RED_THRESHOLD")!)
    : -10;
  return { amberThreshold: amber, redThreshold: red };
}

/**
 * INV-6 lock check: any locked period record overlapping [periodStart, periodEnd] for this
 * KPI. Candidate set by `kpr_kpiId` substring, then exact + overlap + locked refine in JS.
 *
 * Cross-backend caveat during the partial migration: locks are *written* by
 * `lockPeriod`/`reopenPeriod`, which still run on Prisma/Postgres. Until those are also
 * swapped to Collections, no `kpr_locked=true` row exists here, so this check is
 * effectively a no-op. That is a known gap, not a silent bug — see the action's MIGRATION note.
 */
export async function findLockedOverlappingPeriod(
  kpiId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<boolean> {
  const rows = await searchUnion(COLLECTIONS.kpiPeriodRecord, [
    { fields: ["kpr_kpiId"], q: kpiId },
  ]);
  return rows.some((r) => {
    const d = r.data;
    if (str(d.kpr_kpiId) !== kpiId) return false;
    if (!bool(d.kpr_locked)) return false;
    const ps = str(d.kpr_periodStart);
    const pe = str(d.kpr_periodEnd);
    if (!ps || !pe) return false;
    // overlap: existing.start <= end && existing.end >= start
    return new Date(ps) <= periodEnd && new Date(pe) >= periodStart;
  });
}

/** All period records for a KPI, newest first — feeds the consecutive-RED escalation calc. */
export async function listPeriodRecords(
  kpiId: string,
): Promise<{ periodStart: Date; statusColor: string }[]> {
  const rows = await searchUnion(COLLECTIONS.kpiPeriodRecord, [
    { fields: ["kpr_kpiId"], q: kpiId },
  ]);
  return rows
    .filter((r) => str(r.data.kpr_kpiId) === kpiId)
    .map((r) => ({
      periodStart: new Date(String(r.data.kpr_periodStart)),
      statusColor: String(r.data.kpr_statusColor ?? ""),
    }))
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
}

/** Open countermeasure for a KPI, if any (`cm_status === 'OPEN'`). */
export async function findOpenCountermeasure(
  kpiId: string,
): Promise<{ id: string } | null> {
  const rows = await searchUnion(COLLECTIONS.countermeasure, [
    { fields: ["cm_kpiId"], q: kpiId },
  ]);
  const open = rows.find(
    (r) => str(r.data.cm_kpiId) === kpiId && str(r.data.cm_status) === "OPEN",
  );
  return open ? { id: open.id } : null;
}

// --- Write operations ----------------------------------------------------------

/** `tx.kPIPeriodRecord.create(...)` → returns the new record id. */
export async function createPeriodRecord(
  input: PeriodRecordInput,
): Promise<string> {
  return createRecord(COLLECTIONS.kpiPeriodRecord, {
    kpr_kpiId: input.kpiId,
    kpr_periodStart: input.periodStart.toISOString(),
    kpr_periodEnd: input.periodEnd.toISOString(),
    kpr_targetValue: input.targetValue,
    kpr_actualValue: input.actualValue,
    kpr_variance: input.variance,
    kpr_statusColor: input.statusColor,
    kpr_ownerComment: input.ownerComment,
    kpr_varianceReason: input.varianceReason,
    kpr_evidenceUrl: input.evidenceUrl,
    kpr_submittedById: input.submittedById,
    kpr_submittedAt: new Date().toISOString(),
    kpr_locked: false,
  });
}

/** `tx.countermeasure.create(...)` → returns the new record id. */
export async function createCountermeasure(input: {
  kpiId: string;
  problemStatement: string;
}): Promise<string> {
  return createRecord(COLLECTIONS.countermeasure, {
    cm_kpiId: input.kpiId,
    cm_problemStatement: input.problemStatement,
    cm_status: "OPEN",
  });
}

/** `recordAudit(tx, ...)` — writes one `hk_audit_log` row (INV-1). */
export async function recordAudit(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes?: FieldChange[];
  summary?: string | null;
  context: string;
}): Promise<string> {
  const hasChanges = Array.isArray(input.changes) && input.changes.length > 0;
  return createRecord(COLLECTIONS.auditLog, {
    aud_actorUserId: input.actorUserId ?? null,
    aud_action: input.action,
    aud_entityType: input.entityType,
    aud_entityId: input.entityId,
    aud_changes: hasChanges ? JSON.stringify(input.changes) : null,
    aud_summary: input.summary ?? null,
    aud_context: input.context,
    aud_createdAt: new Date().toISOString(),
  });
}

/**
 * `upsertSystemTask(tx, ...)` — idempotent on dedupeKey
 * `"{type}:{entityType}:{entityId}:{periodKey}"` (INV-2). Because the platform does not
 * enforce `@unique`, we find-by-key then create.
 */
export async function upsertSystemTask(input: {
  type: string;
  entityType: string;
  entityId: string;
  periodKey?: string | null;
  title: string;
  description?: string | null;
  priority?: string;
  escalationLevel?: number;
  assigneeId?: string | null;
  assigneeDeptId?: string | null;
  links?: {
    kpiId?: string | null;
    kpiPeriodRecordId?: string | null;
    countermeasureId?: string | null;
    actionPlanId?: string | null;
    decisionId?: string | null;
  };
}): Promise<{ id: string; created: boolean }> {
  const dedupeKey = [
    input.type,
    input.entityType,
    input.entityId,
    input.periodKey ?? "",
  ].join(":");

  const candidates = await searchUnion(COLLECTIONS.task, [
    { fields: ["tsk_dedupeKey"], q: dedupeKey },
  ]);
  const existing = candidates.find((r) => str(r.data.tsk_dedupeKey) === dedupeKey);
  if (existing) return { id: existing.id, created: false };

  const id = await createRecord(COLLECTIONS.task, {
    tsk_type: input.type,
    tsk_title: input.title,
    tsk_description: input.description ?? null,
    tsk_source: "SYSTEM",
    tsk_status: "OPEN",
    tsk_priority: input.priority ?? "MEDIUM",
    tsk_escalationLevel: input.escalationLevel ?? 0,
    tsk_periodKey: input.periodKey ?? null,
    tsk_dedupeKey: dedupeKey,
    tsk_assigneeId: input.assigneeId ?? null,
    tsk_assigneeDeptId: input.assigneeDeptId ?? null,
    tsk_kpiId: input.links?.kpiId ?? null,
    tsk_kpiPeriodRecordId: input.links?.kpiPeriodRecordId ?? null,
    tsk_countermeasureId: input.links?.countermeasureId ?? null,
    tsk_actionPlanId: input.links?.actionPlanId ?? null,
    tsk_decisionId: input.links?.decisionId ?? null,
  });
  return { id, created: true };
}

/**
 * `notify(tx, ...)` — idempotent on dedupeKey
 * `"{userId}:{type}:{entityType}:{entityId}:{periodKey}"` when `entityId` is present (INV-3).
 */
export async function notify(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  periodKey?: string | null;
  taskId?: string | null;
  channel?: string;
}): Promise<{ id: string; created: boolean }> {
  const dedupeKey = input.entityId
    ? [
        input.userId,
        input.type,
        input.entityType ?? "",
        input.entityId,
        input.periodKey ?? "",
      ].join(":")
    : null;

  if (dedupeKey) {
    const candidates = await searchUnion(COLLECTIONS.notificationLog, [
      { fields: ["ntf_dedupeKey"], q: dedupeKey },
    ]);
    const existing = candidates.find((r) => str(r.data.ntf_dedupeKey) === dedupeKey);
    if (existing) return { id: existing.id, created: false };
  }

  const id = await createRecord(COLLECTIONS.notificationLog, {
    ntf_userId: input.userId,
    ntf_type: input.type,
    ntf_title: input.title,
    ntf_body: input.body ?? null,
    ntf_channel: input.channel ?? "IN_APP",
    ntf_entityType: input.entityType ?? null,
    ntf_entityId: input.entityId ?? null,
    ntf_periodKey: input.periodKey ?? null,
    ntf_dedupeKey: dedupeKey,
    ntf_taskId: input.taskId ?? null,
    ntf_createdAt: new Date().toISOString(),
  });
  return { id, created: true };
}
