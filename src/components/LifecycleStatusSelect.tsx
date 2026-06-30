"use client";

/**
 * FR-06: Hoshin / MajorTask / ActionPlan yaşam döngüsü durum seçici.
 * Kurum geneli roller için düzenlenebilir dropdown; diğerleri için okunabilir rozet.
 */

import { useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  setHoshinStatus,
  setMajorTaskStatus,
  setActionPlanStatus,
} from "@/app/actions/lifecycleActions";

export type LifecycleEntityType = "HOSHIN" | "MAJOR_TASK" | "ACTION_PLAN";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  NOT_STARTED: "Başlamadı",
  IN_PROGRESS: "Devam Ediyor",
  DELAYED: "Gecikti",
};

const STATUS_OPTIONS: Record<LifecycleEntityType, string[]> = {
  HOSHIN: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
  MAJOR_TASK: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
  ACTION_PLAN: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"],
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-zinc-700/30 text-zinc-300 border-zinc-600/40",
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  COMPLETED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  CANCELLED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  NOT_STARTED: "bg-zinc-700/30 text-zinc-300 border-zinc-600/40",
  IN_PROGRESS: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  DELAYED: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export function LifecycleStatusSelect({
  entityType,
  entityId,
  currentStatus,
  canEdit,
}: {
  entityType: LifecycleEntityType;
  entityId: string;
  currentStatus: string;
  canEdit: boolean;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const labelCls = `text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_CLASS[status] ?? "bg-zinc-900 text-zinc-400 border-zinc-700"}`;

  const onChange = (newStatus: string) => {
    if (newStatus === status) return;
    setError(null);
    startTransition(async () => {
      const action =
        entityType === "HOSHIN"
          ? setHoshinStatus
          : entityType === "MAJOR_TASK"
            ? setMajorTaskStatus
            : setActionPlanStatus;
      const res = await action(entityId, newStatus);
      if (res.success) {
        setStatus(newStatus);
      } else {
        setError(res.error);
      }
    });
  };

  if (!canEdit) {
    return <span className={labelCls}>{STATUS_LABELS[status] ?? status}</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Select value={status} onValueChange={(v) => { if (v !== null) onChange(v); }} disabled={isPending}>
        <SelectTrigger className={`h-6 w-36 text-[10px] border ${STATUS_CLASS[status] ?? "bg-zinc-900 text-zinc-400 border-zinc-700"}`}>
          <SelectValue>{STATUS_LABELS[status] ?? status}</SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800">
          {STATUS_OPTIONS[entityType].map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_LABELS[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  );
}
