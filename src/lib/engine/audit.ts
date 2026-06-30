/**
 * Denetim (audit) yardımcıları — bu dosyada yalnız saf `diff`. Yan etkili `recordAudit`
 * (tx içinde) Faz 3'te eklenir.
 */

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
