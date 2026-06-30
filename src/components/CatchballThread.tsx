"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { postCatchball, transitionCatchball } from "@/app/actions/catchballActions";
import { ORG_WIDE_ROLES, DEPARTMENT_SCOPED_ROLES } from "@/lib/domainTypes";

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

/** FR-08: durum değiştirmeyen (geçiş gerektirmeyen) öğe tipleri. */
const POST_ITEM_TYPES = [
  { value: "COMMENT", label: "Yorum" },
  { value: "REVISION_REQUEST", label: "Revizyon Talebi" },
  { value: "COUNTER_PROPOSAL", label: "Karşı Öneri" },
];

const ITEM_TYPE_LABELS: Record<string, string> = {
  COMMENT: "Yorum",
  REVISION_REQUEST: "Revizyon Talebi",
  COUNTER_PROPOSAL: "Karşı Öneri",
  APPROVAL: "Onay",
  REJECTION: "Ret",
};

/** FR-09: yönlendirilebilecek roller. */
const ALL_ROLES: string[] = [...ORG_WIDE_ROLES, ...DEPARTMENT_SCOPED_ROLES];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Sistem Yöneticisi",
  PMO: "PMO",
  EXECUTIVE: "Yönetici",
  DEPT_HEAD: "Departman Başkanı",
  KPI_OWNER: "KPI Sahibi",
  USER: "Kullanıcı",
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
type DeptOption = { id: string; name: string };

function fmt(d: string | Date): string {
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function CatchballThread({
  entityType,
  entityId,
  status,
  items,
  users,
  departments = [],
}: {
  entityType: string;
  entityId: string;
  status: string | null;
  items: ThreadItem[];
  users: UserOption[];
  /** FR-09: departman yönlendirme seçenekleri. */
  departments?: DeptOption[];
}) {
  const [message, setMessage] = useState("");
  const [counterparty, setCounterparty] = useState("");
  // FR-08: öğe tipi seçici
  const [itemType, setItemType] = useState("COMMENT");
  // FR-09: rol ve departman yönlendirme
  const [toRole, setToRole] = useState("");
  const [toDeptId, setToDeptId] = useState("");
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
        itemType: itemType || "COMMENT",
        toRole: toRole || undefined,
        toDeptId: toDeptId || undefined,
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
        toRole: toRole || undefined,
        toDeptId: toDeptId || undefined,
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

      {/* FR-08: tüm öğe tipleri içeren catchball geçmişi */}
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
                {it.toUser && (
                  <span className="text-zinc-600">@ {it.toUser.name}</span>
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

        {/* Birinci satır: FR-08 öğe tipi + karşı taraf kullanıcı */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={itemType} onValueChange={(v) => { if (v !== null) setItemType(v); }}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-44 text-xs">
              <SelectValue placeholder="Öğe tipi">
                {POST_ITEM_TYPES.find((t) => t.value === itemType)?.label ?? itemType}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {POST_ITEM_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={counterparty} onValueChange={(v) => setCounterparty(v !== null ? v : "")}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-48 text-xs">
              <SelectValue placeholder="Kullanıcı (opsiyonel)">
                {counterparty ? users.find((u) => u.id === counterparty)?.name : "Kullanıcı (opsiyonel)"}
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
        </div>

        {/* FR-09: rol + departman yönlendirme */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={toRole} onValueChange={(v) => setToRole(v !== null ? v : "")}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-44 text-xs">
              <SelectValue placeholder="Role yönlendir (opsiyonel)">
                {toRole ? (ROLE_LABELS[toRole] ?? toRole) : "Role yönlendir (opsiyonel)"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {ROLE_LABELS[r] ?? r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {departments.length > 0 && (
            <Select value={toDeptId} onValueChange={(v) => setToDeptId(v !== null ? v : "")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-48 text-xs">
                <SelectValue placeholder="Departmana yönlendir (opsiyonel)">
                  {toDeptId
                    ? departments.find((d) => d.id === toDeptId)?.name
                    : "Departmana yönlendir (opsiyonel)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Aksiyonlar: gönder + durum geçiş düğmeleri */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={onComment}
            disabled={isPending}
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 h-8"
          >
            Gönder
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
