"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Activity, Target, AlertTriangle, FileText } from "lucide-react";

export function ReportClient({ stats, hoshinProgress, topCriticalKpis, recentDecisions }: any) {
  const handlePrint = () => {
    window.print();
  };

  const today = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="flex flex-col gap-4">
      {/* Yazdır Butonu (Baskıda gizlenir) */}
      <div className="flex justify-end print-hidden">
        <Button onClick={handlePrint} className="bg-zinc-800 hover:bg-zinc-700 text-white">
          <Printer size={16} className="mr-2" /> Raporu PDF Olarak İndir / Yazdır
        </Button>
      </div>

      {/* A4 Formatında Kağıt Görünümü */}
      <div className="bg-white text-black p-8 rounded-lg shadow-xl print:shadow-none min-h-[297mm] w-full max-w-[210mm] mx-auto flex flex-col gap-6">
        
        {/* Antet ve Başlık */}
        <div className="border-b-2 border-black pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Hoshin Kanri</h1>
            <h2 className="text-xl font-bold text-gray-600 mt-1">İcra Kurulu Aylık Durum Özeti (One-Pager)</h2>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Rapor Tarihi</div>
            <div className="text-lg font-bold">{today}</div>
          </div>
        </div>

        {/* Bölüm 1: Genel Sağlık ve Strateji (Yan yana 2 kolon) */}
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg border-b border-gray-300 pb-1 flex items-center gap-2">
              <Activity size={18} /> Şirket Genel Sağlığı
            </h3>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-green-100 border border-green-300 p-3 rounded-md text-center">
                <div className="text-2xl font-black text-green-700">{stats.green}</div>
                <div className="text-xs font-semibold text-green-800 uppercase mt-1">Hedefte</div>
              </div>
              <div className="bg-yellow-100 border border-yellow-300 p-3 rounded-md text-center">
                <div className="text-2xl font-black text-yellow-700">{stats.amber}</div>
                <div className="text-xs font-semibold text-yellow-800 uppercase mt-1">Riskli</div>
              </div>
              <div className="bg-red-100 border border-red-300 p-3 rounded-md text-center">
                <div className="text-2xl font-black text-red-700">{stats.red}</div>
                <div className="text-xs font-semibold text-red-800 uppercase mt-1">Sapan</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg border-b border-gray-300 pb-1 flex items-center gap-2">
              <Target size={18} /> Stratejik İlerleme (Hoshin)
            </h3>
            <div className="flex flex-col gap-3 mt-2">
              {hoshinProgress.map((hp: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs font-semibold text-gray-700">
                    <span className="truncate pr-2">{hp.name}</span>
                    <span>%{hp.progress}</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full" style={{ width: `${hp.progress}%` }} />
                  </div>
                </div>
              ))}
              {hoshinProgress.length === 0 && <div className="text-sm text-gray-500">Strateji ağacı verisi yok.</div>}
            </div>
          </div>
        </div>

        {/* Bölüm 2: Kırmızı KPI'lar ve A3 Özeti */}
        <div className="flex flex-col gap-2 mt-2">
          <h3 className="font-bold text-lg border-b border-gray-300 pb-1 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600" /> Kritik Sapmalar ve Problem Çözme (A3)
          </h3>
          <div className="flex flex-col gap-3 mt-2">
            {topCriticalKpis.map((kpi: any) => {
              const cm = kpi.countermeasures?.[0];
              const record = kpi.periodRecords?.[0];
              return (
                <div key={kpi.id} className="border border-red-200 bg-red-50/30 p-3 rounded-md flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-red-800">{kpi.name}</div>
                    <div className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      Hedef: {kpi.targetYear} | Aktüel: {record?.actualValue}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div className="text-sm">
                      <span className="font-semibold text-gray-700 block">Problem/Kök Neden:</span>
                      <span className="text-gray-600 text-xs">{cm?.rootCause || record?.ownerComment || 'Kök neden analizi bekleniyor.'}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-gray-700 block">Alınan Karşı Önlem (Aksiyon):</span>
                      <span className="text-gray-600 text-xs">{cm?.actionSummary || 'Aksiyon bekleniyor.'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {topCriticalKpis.length === 0 && <div className="text-sm text-gray-500 italic">Müdahale gerektiren kırmızı metrik bulunmuyor.</div>}
          </div>
        </div>

        {/* Bölüm 3: Son Alınan Yönetim Kararları */}
        <div className="flex flex-col gap-2 mt-2 flex-1">
          <h3 className="font-bold text-lg border-b border-gray-300 pb-1 flex items-center gap-2">
            <FileText size={18} /> Açık Kararlar / Görevler
          </h3>
          <table className="w-full text-sm mt-2 border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left p-2 font-semibold text-gray-700">Karar / Görev Tanımı</th>
                <th className="text-left p-2 font-semibold text-gray-700 w-32">İlişkili Bağlam</th>
                <th className="text-left p-2 font-semibold text-gray-700 w-32">Sorumlu</th>
              </tr>
            </thead>
            <tbody>
              {recentDecisions.map((dec: any) => (
                <tr key={dec.id} className="border-b border-gray-200">
                  <td className="p-2 text-gray-800">{dec.decisionText}</td>
                  <td className="p-2 text-gray-600 text-xs">{dec.kpi?.name || dec.review?.title}</td>
                  <td className="p-2 text-gray-600 font-medium">{dec.assignee?.name || '-'}</td>
                </tr>
              ))}
              {recentDecisions.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-500 italic border-b border-gray-200">Açık yönetim kararı bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="mt-auto border-t border-gray-300 pt-2 text-center text-xs text-gray-400">
          Bu rapor Hoshin Kanri platformu tarafından otomatik olarak üretilmiştir.
        </div>
      </div>
    </div>
  );
}
