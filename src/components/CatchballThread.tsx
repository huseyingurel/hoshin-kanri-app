"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { postCatchball, transitionCatchball } from "@/app/actions/catchballActions";

/**
 * Yalnız UI amaçlı geçiş haritası — hangi düğmelerin gösterileceğini belirler.
 * Gerçek kural sunucudadır: `transitionCatchball` → `applyTransition` her geçişi
 * `canTransition` ile yeniden doğrular ve izinsizse fırlatır (INV-5/INV-7).
 */
const NEXT: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["REVISED", "AGREED", "REJECTED"],
  REVISED: ["IN_REVIEW", "AGREED"],
  AGREED: ["APPROVED", "IN_REVIEW"],
  APPROVED: [],
  REJECTED: ["DRAFT"],
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  IN_REVIEW: "İncelemede",
  REVISED: "Revize Edildi",
  AGREED: "Mutabık",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-zinc-700/30 text-zinc-300 border-zinc-600/40",
  IN_REVIEW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  REVISED: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  AGREED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  COMMENT: "Yorum",
  REVISION_REQUEST: "Revizyon Talebi",
  COUNTER_PROPOSAL: "Karşı Öneri",
  APPROVAL: "Onay",
  REJECTION: "Ret",
};

type ThreadItem = {
  id: string;
  type: string;
  message: string;
  resultingStatus: string | null;
  createdAt: string | Date;
  fromUser: { id: string; name: string } | null;
  toUser: { id: string; name: string } | null;
};

type UserOption = { id: string; name: string };

function fmt(d: string | Date): string {
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function CatchballThread({
  entityType,
  entityId,
  status,
  items,
  users,
}: {
  entityType: string;
  entityId: string;
  status: string | null;
  items: ThreadItem[];
  users: UserOption[];
}) {
  const [message, setMessage] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextOptions = status ? (NEXT[status] ?? []) : [];
  const approved = status === "APPROVED";

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.success) {
        setError(res.error ?? "İşlem başarısız.");
      } else {
        setMessage("");
      }
    });
  };

  const onComment = () => {
    if (!message.trim()) {
      setError("Mesaj boş olamaz.");
      return;
    }
    run(() =>
      postCatchball({
        entityType,
        entityId,
        message,
        toUserId: counterparty || undefined,
      }),
    );
  };

  const onTransition = (to: string) => {
    if (!message.trim()) {
      setError("Geçiş için bir açıklama girin.");
      return;
    }
    run(() =>
      transitionCatchball({
        entityType,
        entityId,
        to,
        message,
        counterpartyUserId: counterparty || undefined,
      }),
    );
  };

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">Catchball (Top Atışı)</span>
          <Badge variant="outline" className={STATUS_CLASS[status ?? ""] ?? "bg-zinc-900 text-zinc-400 border-zinc-700"}>
            {STATUS_LABELS[status ?? ""] ?? status ?? "—"}
          </Badge>
        </div>
        {/* INV-5: yalnız APPROVED canlı incelemeye uygundur. */}
        {approved ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={14} /> Canlı incelemeye uygun
          </span>
        ) : (
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <XCircle size={14} /> Onaylanmadı — canlıya alınamaz
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className="bg-zinc-900/40 border border-zinc-800/50 rounded p-2 text-sm">
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <span className="text-zinc-400">{it.fromUser?.name ?? "Sistem"}</span>
                <Badge variant="outline" className="bg-zinc-900 text-zinc-400 border-zinc-700 text-[10px]">
                  {ITEM_TYPE_LABELS[it.type] ?? it.type}
                </Badge>
                {it.resultingStatus && (
                  <span className="text-zinc-600">→ {STATUS_LABELS[it.resultingStatus] ?? it.resultingStatus}</span>
                )}
                <span className="ml-auto">{fmt(it.createdAt)}</span>
              </div>
              <p className="text-zinc-300">{it.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mesaj / açıklama yazın..."
          className="bg-zinc-900 border-zinc-800 text-sm"
          disabled={isPending}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={counterparty} onValueChange={(v) => setCounterparty(v || "")}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-48 text-xs">
              <SelectValue placeholder="Karşı taraf (opsiyonel)">
                {counterparty ? users.find((u) => u.id === counterparty)?.name : "Karşı taraf (opsiyonel)"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={onComment}
            disabled={isPending}
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 h-8"
          >
            Yorum Ekle
          </Button>
          {nextOptions.map((to) => (
            <Button
              key={to}
              size="sm"
              onClick={() => onTransition(to)}
              disabled={isPending}
              className="h-8 bg-blue-600/80 hover:bg-blue-600 text-white"
            >
              {STATUS_LABELS[to] ?? to}
            </Button>
          ))}
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
