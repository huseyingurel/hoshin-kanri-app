/**
 * Eskalasyon — saf (I/O yok) karar fonksiyonları.
 *
 * Seviyeler: 0 = eskalasyon yok, 1 = yönetici, 2 = sponsor/PMO (stratejik).
 * Tetikler: 2 ardışık RED dönem → 2; uzun süreli gecikme (≥ SUSTAINED_OVERDUE_DAYS) → 2;
 *           herhangi bir gecikme (gün > 0) → en az 1.
 */

export type EscalationLevel = 0 | 1 | 2;

/** Gecikmenin "stratejik" eskalasyona dönüştüğü eşik (gün). */
export const SUSTAINED_OVERDUE_DAYS = 14;

export interface EscalationInput {
  /** Vadeden bu yana geçen gün; 0/negatif = gecikme yok. */
  daysOverdue: number;
  /** Üst üste RED gelen dönem sayısı. */
  consecutiveRed: number;
}

export function computeEscalationLevel({ daysOverdue, consecutiveRed }: EscalationInput): EscalationLevel {
  if (consecutiveRed >= 2) return 2;
  if (daysOverdue >= SUSTAINED_OVERDUE_DAYS) return 2;
  if (daysOverdue > 0) return 1;
  return 0;
}

/** Bildirim/eskalasyon hedefi olabilecek asgari kullanıcı referansı. */
export interface UserRef {
  id: string;
}

/**
 * Bir eskalasyon seviyesinde **ek olarak** bilgilendirilecek kişiler.
 * Sahip (owner) zaten taban bildirimleri ayrıca aldığı için burada yer almaz.
 * - 0 → [] (eskalasyon yok)
 * - 1 → [yönetici]
 * - 2 → [sponsor, PMO]
 * Null/undefined hedefler ve tekrarlar (aynı id) elenir.
 */
export function escalationRecipients(
  level: EscalationLevel,
  manager: UserRef | null | undefined,
  sponsor: UserRef | null | undefined,
  pmo: UserRef | null | undefined,
): UserRef[] {
  const dedupe = (refs: Array<UserRef | null | undefined>): UserRef[] => {
    const seen = new Set<string>();
    const out: UserRef[] = [];
    for (const r of refs) {
      if (r && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
    return out;
  };

  switch (level) {
    case 0:
      return [];
    case 1:
      return dedupe([manager]);
    case 2:
      return dedupe([sponsor, pmo]);
    default:
      throw new Error(`Geçersiz eskalasyon seviyesi: ${level as number}`);
  }
}
