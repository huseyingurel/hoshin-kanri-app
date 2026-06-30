/**
 * Bildirim yazıcıları — tx içinde çalışır. Yalnız uygulama-içi (IN_APP) bildirim (N1);
 * `channel` sütunu ileride EMAIL için ayrılmıştır ama gönderici yoktur.
 *
 * İdempotans (INV-3): varlığa bağlı bildirimler `(userId, type, entityType, entityId,
 * periodKey)` beşlisiyle tekilleştirilir. Varlığa bağlı olmayan (entityId'siz) bildirimler
 * için anahtar üretilmez (yanlış bastırmayı önlemek için her zaman oluşturulur).
 */

import { type NotificationLog, type Prisma } from "@prisma/client";
import type { NotificationChannel, NotificationType } from "@/lib/domainTypes";
import { logEvent } from "@/lib/log";

/**
 * Bildirim idempotans anahtarı: "{userId}:{type}:{entityType}:{entityId}:{periodKey}".
 * entityId yoksa null döner → tekilleştirme yapılmaz (her çağrı yeni satır üretir).
 */
export function buildNotificationDedupeKey(
  userId: string,
  type: NotificationType,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  periodKey: string | null | undefined,
): string | null {
  if (!entityId) return null;
  return [userId, type, entityType ?? "", entityId, periodKey ?? ""].join(":");
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  periodKey?: string | null;
  taskId?: string | null;
  channel?: NotificationChannel;
  /**
   * true (varsayılan): aynı beşli için ikinci bildirim bastırılır (INV-3).
   * false: her zaman yeni satır (ör. catchball gibi doğası gereği tekrarlı olmayan olaylar
   * için dedupe çok kaba kaldığında).
   */
  idempotent?: boolean;
}

export interface NotifyResult {
  notification: NotificationLog;
  /** true = yeni oluşturuldu; false = aynı dedupeKey zaten vardı (atlandı). */
  created: boolean;
}

/** Tek bir kullanıcıya bildirim yazar (tx içinde). */
export async function notify(
  tx: Prisma.TransactionClient,
  input: NotifyInput,
): Promise<NotifyResult> {
  const idempotent = input.idempotent ?? true;
  const dedupeKey = idempotent
    ? buildNotificationDedupeKey(
        input.userId,
        input.type,
        input.entityType,
        input.entityId,
        input.periodKey,
      )
    : null;

  if (dedupeKey) {
    const existing = await tx.notificationLog.findUnique({ where: { dedupeKey } });
    if (existing) {
      logEvent("info", "notification.skipped_duplicate", {
        notificationId: existing.id,
        userId: input.userId,
        type: input.type,
        dedupeKey,
      });
      return { notification: existing, created: false };
    }
  }

  const notification = await tx.notificationLog.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      channel: input.channel ?? "IN_APP",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      periodKey: input.periodKey ?? null,
      dedupeKey,
      taskId: input.taskId ?? null,
    },
  });
  logEvent("info", "notification.created", {
    notificationId: notification.id,
    userId: input.userId,
    type: input.type,
    dedupeKey,
  });
  return { notification, created: true };
}

/**
 * Aynı yükü birden çok alıcıya gönderir. Alıcılar çağıran tarafından tekilleştirilmiş
 * olmalıdır (ör. `escalationRecipients`); burada ek tekilleştirme yapılmaz.
 */
export async function notifyMany(
  tx: Prisma.TransactionClient,
  recipients: ReadonlyArray<{ id: string }>,
  payload: Omit<NotifyInput, "userId">,
): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  for (const r of recipients) {
    results.push(await notify(tx, { ...payload, userId: r.id }));
  }
  return results;
}
