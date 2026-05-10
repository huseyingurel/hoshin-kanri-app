"use client"

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Wrench, CheckCircle2, Save } from "lucide-react";
import { updateCountermeasure } from "../actions/countermeasureActions";

export function CountermeasureClient({ countermeasures }: { countermeasures: any[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { rootCause: string; actionSummary: string }>>({});

  const handleEditChange = (id: string, field: "rootCause" | "actionSummary", value: string) => {
    setEdits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSave = async (cm: any) => {
    const editData = edits[cm.id];
    if (!editData && !cm.rootCause && !cm.actionSummary) return;

    setLoading(cm.id);
    try {
      await updateCountermeasure(cm.id, {
        rootCause: editData?.rootCause !== undefined ? editData.rootCause : cm.rootCause,
        actionSummary: editData?.actionSummary !== undefined ? editData.actionSummary : cm.actionSummary
      });
      alert("A3 Kaydedildi.");
    } catch (e) {
      console.error(e);
      alert("Hata oluştu.");
    }
    setLoading(null);
  };

  const handleClose = async (id: string) => {
    if (!confirm("Bu problemi çözüldü olarak işaretlemek istediğinize emin misiniz?")) return;
    setLoading(id);
    await updateCountermeasure(id, { status: "CLOSED" });
    setLoading(null);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {countermeasures.map((cm) => (
        <Card key={cm.id} className={`bg-zinc-950 border-zinc-800 flex flex-col ${cm.status === 'OPEN' ? 'border-amber-500/30' : ''}`}>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start mb-2">
              <Badge variant={cm.status === 'OPEN' ? "default" : "secondary"} 
                     className={cm.status === 'OPEN' ? "bg-amber-500 hover:bg-amber-600" : ""}>
                {cm.status === 'OPEN' ? 'Açık Aksiyon' : 'Kapatıldı'}
              </Badge>
              <span className="text-xs text-zinc-500">Oluşturulma: {formatDate(cm.createdAt)}</span>
            </div>
            <CardTitle className="text-lg">
              <span className="text-zinc-500 text-sm font-normal block mb-1">İlişkili KPI: {cm.kpi?.name}</span>
              {cm.problemStatement}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                <h4 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-400" /> Kök Neden (Root Cause)
                </h4>
                {cm.status === 'OPEN' ? (
                  <Input 
                    placeholder="Problemin ana kaynağı nedir? (5 Neden Analizi vb.)"
                    className="bg-zinc-900 border-zinc-700 h-10"
                    value={edits[cm.id]?.rootCause ?? (cm.rootCause || "")}
                    onChange={(e) => handleEditChange(cm.id, "rootCause", e.target.value)}
                  />
                ) : (
                  <p className="text-zinc-300 text-sm">{cm.rootCause || "-"}</p>
                )}
              </div>
              
              <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                <h4 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Wrench size={16} className="text-blue-400" /> Alınan Aksiyon (Countermeasure)
                </h4>
                {cm.status === 'OPEN' ? (
                  <Input 
                    placeholder="Bu kök nedeni ortadan kaldırmak için ne yapılacak?"
                    className="bg-zinc-900 border-zinc-700 h-10"
                    value={edits[cm.id]?.actionSummary ?? (cm.actionSummary || "")}
                    onChange={(e) => handleEditChange(cm.id, "actionSummary", e.target.value)}
                  />
                ) : (
                  <p className="text-zinc-300 text-sm">{cm.actionSummary || "-"}</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-zinc-800/50 pt-4 flex justify-between items-center bg-zinc-900/20">
            <div className="text-sm text-zinc-500">
              Sorumlu: <span className="text-zinc-300 font-medium">{cm.ownerUser?.name || 'Atanmadı'}</span>
            </div>
            
            {cm.status === 'OPEN' && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-blue-600/10 text-blue-400 border-blue-600/30 hover:bg-blue-600/20"
                  disabled={loading === cm.id}
                  onClick={() => handleSave(cm)}
                >
                  <Save size={16} className="mr-2" />
                  {loading === cm.id ? "..." : "Kaydet"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-emerald-600/10 text-emerald-500 border-emerald-600/30 hover:bg-emerald-600/20"
                  disabled={loading === cm.id}
                  onClick={() => handleClose(cm.id)}
                >
                  <CheckCircle2 size={16} className="mr-2" />
                  Kapat
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>
      ))}
      {countermeasures.length === 0 && (
        <div className="col-span-1 md:col-span-2 text-center text-zinc-500 py-12">
          Şu an açık veya geçmiş bir A3 kaydı bulunmuyor.
        </div>
      )}
    </div>
  );
}
