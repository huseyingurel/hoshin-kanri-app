"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FieldChange = { field: string; old: unknown; new: unknown };

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  context: string;
  changes: FieldChange[] | null;
  createdAt: string | Date;
  actor: { id: string; name: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Oluştur",
  UPDATE: "Güncelle",
  DELETE: "Sil",
  TRANSITION: "Geçiş",
  LOCK: "Kilitle",
  REOPEN: "Aç",
  ESCALATE: "Eskalasyon",
  NOTIFY: "Bildir",
};

const ACTION_CLASS: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  UPDATE: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DELETE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  ESCALATE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  LOCK: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  REOPEN: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  TRANSITION: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

function fmt(d: string | Date): string {
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ChangesCell({ changes }: { changes: FieldChange[] | null }) {
  if (!changes || changes.length === 0) return <span className="text-zinc-600">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {changes.map((c, i) => (
        <div key={i} className="text-xs">
          <span className="text-zinc-400">{c.field}: </span>
          <span className="text-rose-400/80 line-through">{renderVal(c.old)}</span>
          <span className="text-zinc-600 mx-1">→</span>
          <span className="text-emerald-400">{renderVal(c.new)}</span>
        </div>
      ))}
    </div>
  );
}

export function AuditClient({ logs }: { logs: AuditRow[] }) {
  const [entityType, setEntityType] = useState<string>("ALL");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const entityTypes = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entityType))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const actorQ = actor.trim().toLocaleLowerCase("tr-TR");
    const fromTs = from ? new Date(from).getTime() : null;
    // Bitiş tarihi gün sonuna kadar dahil edilsin.
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return logs.filter((l) => {
      if (entityType !== "ALL" && l.entityType !== entityType) return false;
      if (actorQ) {
        const name = (l.actor?.name ?? "sistem").toLocaleLowerCase("tr-TR");
        if (!name.includes(actorQ)) return false;
      }
      const ts = new Date(l.createdAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    });
  }, [logs, entityType, actor, from, to]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="py-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-zinc-400">Varlık Tipi</Label>
            <Select value={entityType} onValueChange={(v) => setEntityType(v || "ALL")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9">
                <SelectValue>{entityType === "ALL" ? "Tümü" : entityType}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="ALL">Tümü</SelectItem>
                {entityTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-zinc-400">Aktör (ad)</Label>
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="örn. Ali / sistem"
              className="bg-zinc-900 border-zinc-800 h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-zinc-400">Başlangıç</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-zinc-400">Bitiş</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-zinc-500">{filtered.length} kayıt gösteriliyor</div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Tarih</TableHead>
                <TableHead className="text-zinc-400">Aktör</TableHead>
                <TableHead className="text-zinc-400">İşlem</TableHead>
                <TableHead className="text-zinc-400">Varlık</TableHead>
                <TableHead className="text-zinc-400">Özet</TableHead>
                <TableHead className="text-zinc-400">Değişiklikler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id} className="border-zinc-800/50">
                  <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{fmt(l.createdAt)}</TableCell>
                  <TableCell className="text-sm text-zinc-300 whitespace-nowrap">
                    {l.actor?.name ?? <span className="text-zinc-500 italic">Sistem</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_CLASS[l.action] ?? "bg-zinc-900 text-zinc-300 border-zinc-700"}>
                      {ACTION_LABELS[l.action] ?? l.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400 whitespace-nowrap">
                    {l.entityType}
                    <span className="block text-zinc-600 font-mono">{l.entityId.slice(0, 8)}…</span>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-300 max-w-xs">{l.summary ?? "—"}</TableCell>
                  <TableCell>
                    <ChangesCell changes={l.changes} />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow className="border-zinc-800/50">
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    Filtreye uyan kayıt yok.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
