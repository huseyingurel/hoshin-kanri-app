import { PrismaClient } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart2, Target, AlertCircle } from "lucide-react";

const prisma = new PrismaClient();

export default async function KpiBowlingChart() {
  const kpis = await prisma.kPI.findMany({
    include: {
      responsibleDept: true,
      periodRecords: {
        orderBy: { periodStart: 'asc' }
      }
    }
  });

  // Ay isimleri formatlama (mock için basitleştirilmiş)
  const getMonthName = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(new Date(date));
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="text-emerald-500" />
          KPI & Bowling Chart
        </h1>
        <p className="text-zinc-400 mt-2">Dönemsel performans ölçümleri ve hedef sapmaları</p>
      </div>

      <div className="flex flex-col gap-6">
        {kpis.map((kpi) => (
          <Card key={kpi.id} className="bg-zinc-950 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-800/50">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Target size={20} className="text-blue-500" />
                  {kpi.name}
                </CardTitle>
                <CardDescription className="mt-1 flex gap-2">
                  <span>Hedef: <strong>{kpi.targetYear}{kpi.unit}</strong></span>
                  <span>•</span>
                  <span>Sorumlu: {kpi.responsibleDept?.name || 'Belirtilmedi'}</span>
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-zinc-900">{kpi.reportingFrequency}</Badge>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="rounded-md border border-zinc-800 overflow-hidden">
                <Table>
                  <TableHeader className="bg-zinc-900/50">
                    <TableRow className="border-zinc-800">
                      <TableHead className="w-[100px] text-zinc-400">Dönem</TableHead>
                      <TableHead className="text-right text-zinc-400">Hedef</TableHead>
                      <TableHead className="text-right text-zinc-400">Gerçekleşen</TableHead>
                      <TableHead className="text-right text-zinc-400">Sapma</TableHead>
                      <TableHead className="w-[100px] text-center text-zinc-400">Durum</TableHead>
                      <TableHead className="text-zinc-400">Açıklama</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpi.periodRecords.map((record) => (
                      <TableRow key={record.id} className="border-zinc-800">
                        <TableCell className="font-medium text-zinc-300">
                          {getMonthName(record.periodStart)}
                        </TableCell>
                        <TableCell className="text-right text-zinc-400">{record.targetValue}{kpi.unit}</TableCell>
                        <TableCell className="text-right font-medium text-zinc-200">
                          {record.actualValue}{kpi.unit}
                        </TableCell>
                        <TableCell className="text-right text-zinc-400">
                          {record.variance ? (
                            <span className={record.variance > 0 ? "text-rose-400" : "text-emerald-400"}>
                              {record.variance > 0 ? '+' : ''}{record.variance}{kpi.unit}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.statusColor === 'GREEN' && <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30">Hedefte</Badge>}
                          {record.statusColor === 'RED' && <Badge className="bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 border-rose-500/50">Kritik</Badge>}
                          {record.statusColor === 'AMBER' && <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30">Riskli</Badge>}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-400">
                          {record.ownerComment || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {kpi.periodRecords.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-zinc-500">
                          Henüz dönem kaydı girilmemiş.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {kpi.periodRecords.some(r => r.statusColor === 'RED') && (
                <div className="mt-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                  <AlertCircle className="text-rose-500 shrink-0" size={20} />
                  <div>
                    <h4 className="text-rose-400 font-medium mb-1">Karşı Önlem (Countermeasure) Gerekli</h4>
                    <p className="text-sm text-rose-400/80">Bu KPI'da hedef sapması yaşandı. İlgili dönemler için problem analizi ve karşı aksiyonların sisteme girilmesi gerekmektedir.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
