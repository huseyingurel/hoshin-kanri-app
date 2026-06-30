/**
 * Catchball (top atışı) onay yaşam döngüsü — saf geçiş matrisi.
 * Yan etkili `applyTransition` (tx içinde) Faz 3'te eklenir; burada yalnız kurallar.
 *
 * INV-5: bir varlık ancak `catchballStatus === "APPROVED"` ise canlı incelemeye (ACTIVE) geçebilir.
 */

import { CATCHBALL_STATUSES, type CatchballStatus } from "@/lib/domainTypes";

/** İzinli geçişler. APPROVED ve (terminal yakını) durumların çıkışları kasıtlı sınırlıdır. */
export const TRANSITIONS: Record<CatchballStatus, readonly CatchballStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["REVISED", "AGREED", "REJECTED"],
  REVISED: ["IN_REVIEW", "AGREED"],
  AGREED: ["APPROVED", "IN_REVIEW"],
  APPROVED: [], // terminal — onaylanan yeniden açılamaz (gerekirse ayrı bir aksiyon)
  REJECTED: ["DRAFT"], // reddedilen yalnızca yeniden taslağa dönebilir
};

/** Verilen string geçerli bir CatchballStatus mu? */
export function isCatchballStatus(s: string): s is CatchballStatus {
  return (CATCHBALL_STATUSES as readonly string[]).includes(s);
}

/**
 * `from` durumundan `to` durumuna geçiş izinli mi?
 * Geçersiz/bilinmeyen `from` için güvenle `false` döner (sessizce true dönmez).
 */
export function canTransition(from: string, to: string): boolean {
  if (!isCatchballStatus(from)) return false;
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

/** `from` durumundan gidilebilecek durumlar (bilinmeyen `from` → boş dizi). */
export function nextStatuses(from: string): readonly CatchballStatus[] {
  if (!isCatchballStatus(from)) return [];
  return TRANSITIONS[from];
}

/** Varlık canlı incelemeye (ACTIVE) alınabilir mi? Yalnız APPROVED. (INV-5) */
export function canActivate(catchballStatus: string): boolean {
  return catchballStatus === "APPROVED";
}
