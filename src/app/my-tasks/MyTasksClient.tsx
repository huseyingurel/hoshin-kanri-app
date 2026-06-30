"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, AlertTriangle, ArrowUpCircle } from "lucide-react";
import { updateTaskStatus } from "../actions/taskActions";

type TaskRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  dueDate: string | Date | null;
  escalationLevel: number;
  periodKey: string | null;
  kpi: { id: string; name: string } | null;
  countermeasure: { id: string; problemStatement: string } | null;
  actionPlan: { id: string; title: string } | null;
  decision: { id: string; decisionText: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  PERIOD_ENTRY: "Dönem Girişi",
  DUE_SOON: "Vadesi Yaklaşıyor",
  OVERDUE_FOLLOWUP: "Vadesi Geçti",
  RED_KPI_REVIEW: "Kırmızı KPI İncelemesi",
  CM_FOLLOWUP: "Karşı Önlem Takibi",
  DECISION_FOLLOWUP: "Karar Takibi",
  CATCHBALL_REVIEW: "Catchball İncelemesi",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Açık",
  IN_PROGRESS: "Devam Ediyor",
  DONE: "Tamamlandı",
  CANCELLED: "İptal",
};

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

const PRIORITY_LABELS: Record<string, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" };
const PRIORITY_CLASS: Record<string, string> = {
  HIGH: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  LOW: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("tr-TR");
}

function EscalationBadge({ level }: { level: number }) {
  if (level <= 0) return null;
  if (level === 1) {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1">
        <ArrowUpCircle size={12} /> Yönetici Eskalasyonu
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30 gap-1">
      <AlertTriangle size={12} /> Stratejik Eskalasyon
    </Badge>
  );
}

function linkLabel(t: TaskRow): string | null {
  if (t.kpi) return `KPI: ${t.kpi.name}`;
  if (t.countermeasure) return `Karşı Önlem: ${t.countermeasure.problemStatement.slice(0, 60)}`;
  if (t.actionPlan) return `Aksiyon Planı: ${t.actionPlan.title}`;
  if (t.decision) return `Karar: ${t.decision.decisionText.slice(0, 60)}`;
  return null;
}

function TaskCard({ task }: { task: TaskRow }) {
  const [status, setStatus] = useState(task.status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string | null) => {
    if (!next || next === status) return;
    const prev = status;
    setStatus(next); // iyimser
    setError(null);
    startTransition(async () => {
      const res = await updateTaskStatus(task.id, next);
      if (!res.success) {
        setStatus(prev); // geri al
        setError(res.error);
      }
    });
  };

  const done = status === "DONE" || status === "CANCELLED";
  const link = linkLabel(task);

  return (
    <Card className={`bg-zinc-950 border-zinc-800 ${done ? "opacity-60" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <Badge variant="outline" className="bg-zinc-900 text-zinc-300 border-zinc-700">
            {TYPE_LABELS[task.type] ?? task.type}
          </Badge>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <EscalationBadge level={task.escalationLevel} />
            <Badge variant="outline" className={PRIORITY_CLASS[task.priority] ?? PRIORITY_CLASS.MEDIUM}>
              {PRIORITY_LABELS[task.priority] ?? task.priority}
            </Badge>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Calendar size={12} /> {fmtDate(task.dueDate)}
            </span>
          </div>
        </div>
        <CardTitle className="text-base mt-2">{task.title}</CardTitle>
        {link && <CardDescription className="text-xs text-zinc-400">{link}</CardDescription>}
      </CardHeader>
      <CardContent>
        {task.description && <p className="text-sm text-zinc-400 mb-3">{task.description}</p>}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Durum:</span>
          <Select value={status} onValueChange={onChange} disabled={isPending}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-44 text-sm">
              <SelectValue>{STATUS_LABELS[status] ?? status}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {task.source === "MANUAL" && <span className="text-[10px] text-zinc-600 uppercase">Elle</span>}
        </div>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function MyTasksClient({ tasks }: { tasks: TaskRow[] }) {
  const open = tasks.filter((t) => t.status === "OPEN");
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const done = tasks.filter((t) => t.status === "DONE");

  const columns: Array<{ key: string; title: string; items: TaskRow[]; accent: string }> = [
    { key: "OPEN", title: "Açık", items: open, accent: "text-blue-400" },
    { key: "IN_PROGRESS", title: "Devam Ediyor", items: inProgress, accent: "text-indigo-400" },
    { key: "DONE", title: "Tamamlandı", items: done, accent: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {columns.map((col) => (
        <div key={col.key} className="flex flex-col gap-4">
          <h2 className={`text-lg font-semibold flex items-center gap-2 ${col.accent}`}>
            {col.title}
            <span className="text-xs text-zinc-500 font-normal">({col.items.length})</span>
          </h2>
          {col.items.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
          {col.items.length === 0 && (
            <p className="text-zinc-600 text-sm">Bu sütunda görev yok.</p>
          )}
        </div>
      ))}
    </div>
  );
}
