"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateRagSettings } from "../actions/settingActions";
import { Save, AlertCircle } from "lucide-react";

export function SettingsClient({ initialRagSettings }: { initialRagSettings: { amberThreshold: number, redThreshold: number } }) {
  const [amber, setAmber] = useState(initialRagSettings.amberThreshold);
  const [red, setRed] = useState(initialRagSettings.redThreshold);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (red >= amber) {
      alert("Kırmızı sınır, Sarı sınırdan daha düşük (daha negatif) olmalıdır. (Örn: Sarı: -5, Kırmızı: -10)");
      return;
    }
    
    setLoading(true);
    try {
      await updateRagSettings(amber, red);
      alert("Ayarlar başarıyla kaydedildi!");
    } catch (e) {
      console.error(e);
      alert("Kaydedilirken bir hata oluştu.");
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl">RAG (Red-Amber-Green) Tolerans Kuralları</CardTitle>
          <CardDescription>
            Veri girişi yapıldığında sistemin bir KPI'ı hangi oranda sarı veya kırmızı statüye düşüreceğini buradan ayarlayabilirsiniz. Değerler eksi (negatif) sapma oranını temsil eder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          
          <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-amber-500 font-bold mb-1 flex items-center gap-2">
                  <AlertCircle size={16} /> Sarı (Riskli) Eşik Değeri
                </Label>
                <span className="text-xs text-zinc-500">Hedefin yüzde kaç gerisinde kalınırsa KPI "Sarı" olsun?</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">%</span>
                <Input 
                  type="number" 
                  value={amber}
                  onChange={(e) => setAmber(parseFloat(e.target.value))}
                  className="w-24 bg-zinc-950 border-amber-900/50 text-amber-500 font-bold"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-zinc-800/50 pt-4">
              <div className="flex flex-col">
                <Label className="text-rose-500 font-bold mb-1 flex items-center gap-2">
                  <AlertCircle size={16} /> Kırmızı (Sapan) Eşik Değeri
                </Label>
                <span className="text-xs text-zinc-500">Hedefin yüzde kaç gerisinde kalınırsa KPI "Kırmızı" olsun ve otomatik A3 açılsın?</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">%</span>
                <Input 
                  type="number" 
                  value={red}
                  onChange={(e) => setRed(parseFloat(e.target.value))}
                  className="w-24 bg-zinc-950 border-rose-900/50 text-rose-500 font-bold"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-blue-950/20 text-blue-400 p-3 rounded text-sm border border-blue-900/30">
            <strong>Not:</strong> Bu ayarlar kaydedildiği andan itibaren, yeni girilecek olan tüm verilerde geçerli olacaktır. Geçmiş verilerin renkleri değişmez.
          </div>

        </CardContent>
        <CardFooter className="border-t border-zinc-800 pt-4 flex justify-end bg-zinc-900/20">
          <Button 
            onClick={handleSave} 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save size={16} className="mr-2" />
            {loading ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
