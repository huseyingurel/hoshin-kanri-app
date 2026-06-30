/**
 * Denetim (audit) yardımcıları: saf `diff` + tx içinde çalışan `recordAudit`.
 */

import { Prisma, type AuditLog } from "@prisma/client";
import type { AuditAction } from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

export interface FieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

/** Audit JSON'u temiz tutmak için: undefined → null, Date → ISO. */
function normalizeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  const aNil = a === null || a === undefined;
  const bNil = b === null || b === undefined;
  if (aNil || bNil) return aNil && bNil; // her ikisi de boş → eşit; biri boş → farklı

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;

  if (typeof a === "object" && typeof b === "object") {
    // Not: JSON.stringify anahtar sırasına duyarlıdır. Audit yalnız skaler sütunları
    // (string/number/boolean/Date/null) karşılaştırdığı için bu yeterlidir; nesne-değerli
    // alanlar diff edilmek istenirse derin eşitlik gerekir.
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false; // serileştirilemiyorsa farklı say (sessizce eşit deme)
    }
  }
  return false;
}

/**
 * `before` ve `after` arasında, verilen alanlar için değişiklikleri döner.
 * Eşit değerler atlanır; değişen/eklenen/kaldırılan alanlar normalize edilerek listelenir.
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const o = before?.[field];
    const n = after?.[field];
    if (!valuesEqual(o, n)) {
      changes.push({ field, old: normalizeValue(o), new: normalizeValue(n) });
    }
  }
  return changes;
}

export interface RecordAuditInput {
  /** null = SYSTEM aktörü (cron/sweep). */
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** `diff()` çıktısı; boş/verilmemişse JSON sütunu null kalır. */
  changes?: FieldChange[];
  /** Okunabilir Türkçe tek satır özet. */
  summary?: string | null;
  /** Çağrı yeri: "saveKpiRecord" | "sweep" | "catchball.applyTransition" | ... */
  context: string;
}

/**
 * Bir `AuditLog` satırını **çağıranın transaction'ı içinde** yazar (INV-1).
 * Daima bir `$transaction` callback'inden çağrılmalıdır; audit yazımı başarısız olursa
 * tüm mutasyon geri alınır. `logEvent` fırlatmaya karşı korunaklıdır (bkz. log.ts).
 */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  input: RecordAuditInput,
): Promise<AuditLog> {
  const hasChanges = Array.isArray(input.changes) && input.changes.length > 0;
  const row = await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changes: hasChanges ? (input.changes as unknown as Prisma.InputJsonValue) : undefined,
      summary: input.summary ?? null,
      context: input.context,
    },
  });
  logEvent("info", "audit.recorded", {
    auditId: row.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId ?? null,
    context: input.context,
  });
  return row;
}
