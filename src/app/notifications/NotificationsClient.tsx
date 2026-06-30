"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCheck, Circle } from "lucide-react";
import { markRead, markAllRead } from "../actions/notificationActions";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  periodKey: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
};

const TYPE_LABELS: Record<string, string> = {
  PERIOD_OPENED: "Dönem Açıldı",
  DUE_SOON: "Vadesi Yaklaşıyor",
  OVERDUE: "Vadesi Geçti",
  KPI_RED: "KPI Kırmızı",
  STRATEGIC_ESCALATION: "Stratejik Eskalasyon",
  REVIEW_UPCOMING: "Yaklaşan Değerlendirme",
  DECISION_ASSIGNED: "Karar Atandı",
  CM_OVERDUE: "Karşı Önlem Gecikti",
  CATCHBALL_REQUEST: "Catchball Talebi",
  CATCHBALL_APPROVED: "Catchball Onaylandı",
};

const TYPE_CLASS: Record<string, string> = {
  KPI_RED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  STRATEGIC_ESCALATION: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  OVERDUE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CM_OVERDUE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  DUE_SOON: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CATCHBALL_APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function fmt(d: string | Date): string {
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsClient({ notifications }: { notifications: NotificationRow[] }) {
  const [items, setItems] = useState(notifications);
  const [isPending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.readAt).length;

  const onMarkAll = () => {
    if (unread === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    startTransition(async () => {
      await markAllRead();
    });
  };

  const onMarkOne = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    startTransition(async () => {
      await markRead(id);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-zinc-400">
          {unread > 0 ? `${unread} okunmamış bildirim` : "Tüm bildirimler okundu"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAll}
          disabled={isPending || unread === 0}
          className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 gap-2"
        >
          <CheckCheck size={14} /> Tümünü okundu işaretle
        </Button>
      </div>

      {items.length === 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="py-12 text-center text-zinc-500">
            Henüz bildiriminiz yok.
          </CardContent>
        </Card>
      )}

      {items.map((n) => {
        const isUnread = !n.readAt;
        return (
          <Card
            key={n.id}
            className={`border-zinc-800 ${isUnread ? "bg-zinc-900/60" : "bg-zinc-950 opacity-70"}`}
          >
            <CardContent className="py-4 flex items-start gap-3">
              <div className="mt-1">
                {isUnread ? (
                  <Circle size={10} className="fill-blue-500 text-blue-500" />
                ) : (
                  <Circle size={10} className="text-zinc-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={TYPE_CLASS[n.type] ?? "bg-zinc-900 text-zinc-300 border-zinc-700"}>
                    {TYPE_LABELS[n.type] ?? n.type}
                  </Badge>
                  <span className="text-xs text-zinc-500">{fmt(n.createdAt)}</span>
                  {n.periodKey && <span className="text-xs text-zinc-600">{n.periodKey}</span>}
                </div>
                <p className={`mt-1 font-medium ${isUnread ? "text-zinc-100" : "text-zinc-400"}`}>{n.title}</p>
                {n.body && <p className="text-sm text-zinc-500 mt-0.5">{n.body}</p>}
              </div>
              {isUnread && (
                <button
                  onClick={() => onMarkOne(n.id)}
                  disabled={isPending}
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                >
                  Okundu
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
