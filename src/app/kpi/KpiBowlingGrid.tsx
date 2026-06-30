"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * Bowling Chart (FR-18/19): KPI'lar satır, dönemler sütun olacak şekilde RAG renkli hücre
 * matrisi + KPI başına trend göstergesi (recharts sparkline). Hücre üzerine gelince
 * hedef/gerçekleşen/sapma/yorum görünür.
 */

type PeriodRecord = {
  periodStart: string | Date;
  targetValue: number | null;
  actualValue: number | null;
  variance: number | null;
  statusColor: string | null;
  ownerComment?: string | null;
  varianceReason?: string | null;
};
type Kpi = {
  id: string;
  name: string;
  unit: string;
  responsibleDept?: { name: string } | null;
  periodRecords: PeriodRecord[];
};

function periodKey(d: string | Date): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const CELL_COLOR: Record<string, string> = {
  GREEN: "bg-emerald-500/25 text-emerald-300 border-emerald-500/30",
  AMBER: "bg-amber-500/25 text-amber-300 border-amber-500/30",
  RED: "bg-rose-500/25 text-rose-300 border-rose-500/40",
};

export function KpiBowlingGrid({ kpis }: { kpis: Kpi[] }) {
  // Tüm KPI'lar arasındaki dönem etiketlerinin birleşimi (sıralı sütunlar).
  const periodSet = new Set<string>();
  for (const kpi of kpis) {
    for (const r of kpi.periodRecords) periodSet.add(periodKey(r.periodStart));
  }
  const periods = Array.from(periodSet).sort();

  const cellFor = (kpi: Kpi, period: string): PeriodRecord | undefined =>
    kpi.periodRecords.find((r) => periodKey(r.periodStart) === period);

  const trendOf = (kpi: Kpi) => {
    const vals = kpi.periodRecords
      .slice()
      .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
      .map((r) => r.actualValue)
      .filter((v): v is number => v != null);
    if (vals.length < 2) return { dir: 0 as const, data: vals.map((v) => ({ v })) };
    const dir = vals[vals.length - 1] > vals[0] ? 1 : vals[vals.length - 1] < vals[0] ? -1 : 0;
    return { dir: dir as -1 | 0 | 1, data: vals.map((v) => ({ v })) };
  };

  if (kpis.length === 0) {
    return <p className="text-zinc-500 text-center py-12">Kapsamınızda görüntülenecek KPI yok.</p>;
  }

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="pt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-2 px-3 text-zinc-400 font-medium sticky left-0 bg-zinc-950 min-w-[180px]">
                KPI
              </th>
              {periods.map((p) => (
                <th key={p} className="py-2 px-2 text-zinc-400 font-medium text-center min-w-[64px]">
                  {p}
                </th>
              ))}
              <th className="py-2 px-3 text-zinc-400 font-medium text-center min-w-[110px]">Trend</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => {
              const trend = trendOf(kpi);
              return (
                <tr key={kpi.id} className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 sticky left-0 bg-zinc-950">
                    <div className="font-medium text-zinc-200">{kpi.name}</div>
                    <div className="text-xs text-zinc-500">
                      {kpi.responsibleDept?.name || "—"} • Hedef ölçü: {kpi.unit}
                    </div>
                  </td>
                  {periods.map((p) => {
                    const rec = cellFor(kpi, p);
                    if (!rec) {
                      return (
                        <td key={p} className="py-1.5 px-2 text-center text-zinc-700">
                          ·
                        </td>
                      );
                    }
                    const color = rec.statusColor ? CELL_COLOR[rec.statusColor] : "bg-zinc-800/40 text-zinc-400 border-zinc-700/40";
                    const title = `Hedef: ${rec.targetValue ?? "-"}${kpi.unit} | Gerçekleşen: ${rec.actualValue ?? "-"}${kpi.unit} | Sapma: ${rec.variance ?? "-"}${rec.varianceReason ? `\nGerekçe: ${rec.varianceReason}` : rec.ownerComment ? `\nYorum: ${rec.ownerComment}` : ""}`;
                    return (
                      <td key={p} className="py-1.5 px-1 text-center">
                        <span
                          title={title}
                          className={`inline-block w-full rounded border px-1.5 py-1 text-xs font-medium cursor-default ${color}`}
                        >
                          {rec.actualValue ?? "-"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3">
                    <div className="flex items-center gap-2 justify-center">
                      {trend.data.length >= 2 ? (
                        <div className="w-16 h-7">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trend.data}>
                              <Line
                                type="monotone"
                                dataKey="v"
                                stroke={trend.dir > 0 ? "#34d399" : trend.dir < 0 ? "#fb7185" : "#a1a1aa"}
                                strokeWidth={1.5}
                                dot={false}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                      {trend.dir > 0 && <TrendingUp size={14} className="text-emerald-400" />}
                      {trend.dir < 0 && <TrendingDown size={14} className="text-rose-400" />}
                      {trend.dir === 0 && trend.data.length >= 2 && <Minus size={14} className="text-zinc-500" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-zinc-600">
          Hücre rengi dönemin RAG durumunu, sayı gerçekleşen değeri gösterir. Ayrıntı için hücrenin üzerine gelin.
        </p>
      </CardContent>
    </Card>
  );
}
