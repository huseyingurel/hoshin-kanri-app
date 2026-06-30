"use client"

import { useState } from "react";
import { saveKpiRecord } from "@/app/actions/kpiActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type KPI = {
  id: string;
  name: string;
  unit: string;
  targetYear: number;
};

export function DataEntryClient({ kpis, settings }: { kpis: KPI[], settings: { amberThreshold: number, redThreshold: number } }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [loading, setLoading] = useState<string | null>(null);
  
  const [inputs, setInputs] = useState<Record<string, { target: string; actual: string; comment: string; reason: string; evidence: string }>>({});

  const handleInputChange = (kpiId: string, field: "target" | "actual" | "comment" | "reason" | "evidence", value: string) => {
    setInputs(prev => ({
      ...prev,
      [kpiId]: {
        ...prev[kpiId],
        [field]: value
      }
    }));
  };

  const handleSave = async (kpiId: string) => {
    const data = inputs[kpiId];
    if (!data?.target || !data?.actual) return alert("Lütfen hedef ve gerçekleşen değerleri girin.");

    const targetVal = parseFloat(data.target);
    const actualVal = parseFloat(data.actual);
    const variance = targetVal !== 0 ? ((actualVal - targetVal) / targetVal) * 100 : 0;
    
    // Eğer sapma Amber sınırından kötüyse (örn: <= -5) ve yorum yoksa uyar
    if (variance <= settings.amberThreshold && !data.comment) {
      return alert(`Sapma oranı yüksek (Kırmızı/Sarı sınırı: %${settings.amberThreshold}). Lütfen bu sapan metrik için bir açıklama (Yorum) giriniz.`);
    }

    setLoading(kpiId);
    try {
      const dateObj = new Date(`${selectedDate}-01`);
      const result = await saveKpiRecord(kpiId, targetVal, actualVal, dateObj, data.comment || "", {
        varianceReason: data.reason || null,
        evidenceUrl: data.evidence || null,
      });
      if (!result.success) {
        alert(result.error);
        return;
      }

      // Kaydedilen inputu temizle
      setInputs(prev => {
        const next = { ...prev };
        delete next[kpiId];
        return next;
      });
      alert("Başarıyla kaydedildi!");
    } catch (e) {
      console.error(e);
      alert("Hata oluştu.");
    }
    setLoading(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 bg-zinc-950 p-4 border border-zinc-800 rounded-lg">
        <Label htmlFor="period-selection" className="font-medium">Dönem Seçimi:</Label>
        <Input 
          id="period-selection"
          type="month" 
          value={selectedDate} 
          onChange={(e) => setSelectedDate(e.target.value)} 
          className="w-48 bg-zinc-900 border-zinc-700"
        />
      </div>

      <div className="rounded-md border border-zinc-800 overflow-hidden bg-zinc-950">
        <Table>
          <TableHeader className="bg-zinc-900/50">
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400">KPI Adı</TableHead>
              <TableHead className="text-zinc-400">Yıllık Hedef</TableHead>
              <TableHead className="text-zinc-400 w-32">Dönem Hedefi</TableHead>
              <TableHead className="text-zinc-400 w-32">Gerçekleşen</TableHead>
              <TableHead className="text-zinc-400 w-48">Açıklama / Yorum</TableHead>
              <TableHead className="text-zinc-400 text-right">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map((kpi) => (
              <TableRow key={kpi.id} className="border-zinc-800">
                <TableCell className="font-medium text-zinc-300">
                  {kpi.name} <Badge variant="outline" className="ml-2 text-xs border-zinc-700">{kpi.unit}</Badge>
                </TableCell>
                <TableCell className="text-zinc-400">{kpi.targetYear}</TableCell>
                <TableCell>
                  <Input 
                    type="number" 
                    placeholder="Hedef" 
                    aria-label={`${kpi.name} Dönem Hedefi`}
                    className="bg-zinc-900 border-zinc-700 h-8"
                    value={inputs[kpi.id]?.target || ""}
                    onChange={(e) => handleInputChange(kpi.id, "target", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input 
                    type="number" 
                    placeholder="Gerçekleşen" 
                    aria-label={`${kpi.name} Gerçekleşen Değer`}
                    className={`h-8 ${
                      inputs[kpi.id]?.target && inputs[kpi.id]?.actual && 
                      ((parseFloat(inputs[kpi.id]?.actual) - parseFloat(inputs[kpi.id]?.target)) / parseFloat(inputs[kpi.id]?.target)) * 100 <= settings.redThreshold 
                      ? "bg-rose-950 border-rose-900 text-rose-200" 
                      : "bg-zinc-900 border-zinc-700"
                    }`}
                    value={inputs[kpi.id]?.actual || ""}
                    onChange={(e) => handleInputChange(kpi.id, "actual", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="text"
                      placeholder="Sapma varsa yorum..."
                      aria-label={`${kpi.name} Açıklama`}
                      className={`h-8 text-xs ${
                        inputs[kpi.id]?.target && inputs[kpi.id]?.actual &&
                        ((parseFloat(inputs[kpi.id]?.actual) - parseFloat(inputs[kpi.id]?.target)) / parseFloat(inputs[kpi.id]?.target)) * 100 <= settings.amberThreshold
                        ? "bg-amber-950 border-amber-900 placeholder:text-amber-700"
                        : "bg-zinc-900 border-zinc-700"
                      }`}
                      value={inputs[kpi.id]?.comment || ""}
                      onChange={(e) => handleInputChange(kpi.id, "comment", e.target.value)}
                    />
                    {/* FR-15: sapma gerekçesi + kanıt bağlantısı */}
                    <Input
                      type="text"
                      placeholder="Sapma gerekçesi (FR-15)"
                      aria-label={`${kpi.name} Sapma Gerekçesi`}
                      className="h-7 text-xs bg-zinc-900 border-zinc-800"
                      value={inputs[kpi.id]?.reason || ""}
                      onChange={(e) => handleInputChange(kpi.id, "reason", e.target.value)}
                    />
                    <Input
                      type="url"
                      placeholder="Kanıt URL (opsiyonel)"
                      aria-label={`${kpi.name} Kanıt Bağlantısı`}
                      className="h-7 text-xs bg-zinc-900 border-zinc-800"
                      value={inputs[kpi.id]?.evidence || ""}
                      onChange={(e) => handleInputChange(kpi.id, "evidence", e.target.value)}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    size="sm" 
                    variant="default"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={loading === kpi.id || !inputs[kpi.id]?.target || !inputs[kpi.id]?.actual}
                    onClick={() => handleSave(kpi.id)}
                  >
                    {loading === kpi.id ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
