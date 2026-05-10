"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Target, FileText, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function DashboardClient({ 
  hoshinProgressData, 
  kpiDistribution, 
  kpiAlerts, 
  countermeasures, 
  recentDecisions,
  summaryCounts 
}: any) {

  return (
    <div className="flex flex-col gap-6">
      
      {/* 4'lü Skor Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Target size={16} className="text-blue-500" /> Aktif Hoshin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-100">{summaryCounts.totalHoshins}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-emerald-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-500 flex items-center gap-2">
              <CheckCircle2 size={16} /> Hedefte (Yeşil)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-100">{summaryCounts.greenKpis}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-rose-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rose-500 flex items-center gap-2">
              <AlertCircle size={16} /> Kırmızı KPI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-rose-100">{summaryCounts.redKpis}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-amber-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-500 flex items-center gap-2">
              <Clock size={16} /> Açık Karşı Önlem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-100">{summaryCounts.openCountermeasures}</div>
          </CardContent>
        </Card>
      </div>

      {/* Grafikler Bölümü */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Hoshin İlerleme Grafiği */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle>Stratejik İlerleme (Hoshin Progress)</CardTitle>
            <CardDescription>Ana hedeflere bağlı aksiyonların ortalama tamamlanma oranları</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {hoshinProgressData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hoshinProgressData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <XAxis type="number" domain={[0, 100]} stroke="#52525b" />
                  <YAxis dataKey="name" type="category" width={120} stroke="#a1a1aa" fontSize={12} />
                  <Tooltip 
                    cursor={{fill: '#27272a'}}
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px' }}
                    formatter={(value: any) => [`%${value}`, 'Tamamlanma']}
                  />
                  <Bar dataKey="progress" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">Strateji ağacı (Hoshin) verisi bulunamadı.</div>
            )}
          </CardContent>
        </Card>

        {/* Genel RAG Dağılımı */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle>Şirket Genel RAG Durumu</CardTitle>
            <CardDescription>Tüm KPI'ların performans statüsü dağılımı</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {kpiDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={kpiDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {kpiDistribution.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">Veri girişi yapılmış KPI bulunamadı.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alt Listeler (Müdahale Gündemi) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Kırmızı KPI'lar */}
        <Card className="bg-zinc-950 border-zinc-800 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-rose-400 flex items-center gap-2">
              <AlertCircle size={18} /> Kritik Sapmalar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {kpiAlerts.map((kpi: any) => (
                <div key={kpi.id} className="flex flex-col gap-1 p-3 rounded-lg bg-rose-950/20 border border-rose-900/30">
                  <div className="font-medium text-sm text-zinc-200">{kpi.name}</div>
                  <div className="text-xs text-zinc-400 flex justify-between">
                    <span>Hedef: {kpi.target}{kpi.unit}</span>
                    <span className="text-rose-400 font-medium">Aktüel: {kpi.value}{kpi.unit}</span>
                  </div>
                </div>
              ))}
              {kpiAlerts.length === 0 && <div className="text-sm text-zinc-500">Müdahale gerektiren sapma yok.</div>}
            </div>
          </CardContent>
        </Card>

        {/* Açık A3'ler */}
        <Card className="bg-zinc-950 border-zinc-800 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center gap-2">
              <Clock size={18} /> Bekleyen A3 Raporları
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {countermeasures.slice(0, 4).map((cm: any) => (
                <div key={cm.id} className="flex flex-col gap-1 p-3 rounded-lg bg-amber-950/10 border border-amber-900/20">
                  <div className="text-xs text-amber-500 mb-1">{cm.kpi?.name || 'Genel Problem'}</div>
                  <div className="text-sm text-zinc-300 line-clamp-2">{cm.problemStatement}</div>
                </div>
              ))}
              {countermeasures.length > 4 && (
                <div className="text-xs text-center text-zinc-500 mt-2">+{countermeasures.length - 4} adet daha...</div>
              )}
              {countermeasures.length === 0 && <div className="text-sm text-zinc-500">Açık problem çözme (A3) formu yok.</div>}
            </div>
          </CardContent>
        </Card>

        {/* Son Yönetim Kararları */}
        <Card className="bg-zinc-950 border-zinc-800 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-emerald-400 flex items-center gap-2">
              <FileText size={18} /> Son Değerlendirme Kararları
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {recentDecisions.map((decision: any) => (
                <div key={decision.id} className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                  <div className="text-xs text-zinc-500 flex items-center justify-between">
                    <span className="truncate">{decision.review?.title}</span>
                    <Badge variant="outline" className="text-[10px] px-1 h-4">{decision.status}</Badge>
                  </div>
                  <div className="text-sm text-zinc-200 flex items-start gap-2">
                    <ChevronRight size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{decision.decisionText}</span>
                  </div>
                </div>
              ))}
              {recentDecisions.length === 0 && <div className="text-sm text-zinc-500">Kayıtlı bir karar bulunmuyor.</div>}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
