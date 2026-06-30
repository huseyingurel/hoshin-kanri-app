"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Save, Trash2, Bookmark } from "lucide-react";
import { createReportTemplate, deleteReportTemplate } from "../actions/reportTemplateActions";

export interface SavedTemplate {
  id: string;
  key: string;
  name: string;
  reportType: string;
  format: string;
}

/**
 * Rapor dışa-aktarma paneli (FR-35/36/37/42). Yıl/renk/departman filtreleri seçilir;
 * her standart rapor için Excel ve PDF indirme bağlantıları üretilir. Filtreler URL'ye
 * eklenir; sunucu tarafı kapsamı yalnız daraltır (genişletmez).
 */

const REPORTS: Array<{ key: string; label: string }> = [
  { key: "executiveOnePager", label: "İcra Kurulu Tek-Sayfa Özeti" },
  { key: "kpiStatus", label: "KPI Durum Raporu" },
  { key: "redKpiCountermeasures", label: "RED KPI ve Karşı Önlemler" },
  { key: "hoshinProgress", label: "Hoshin İlerleme Raporu" },
  { key: "openDecisions", label: "Açık Kararlar" },
];

const COLORS = [
  { value: "", label: "Tüm renkler" },
  { value: "RED", label: "RED" },
  { value: "AMBER", label: "AMBER" },
  { value: "GREEN", label: "GREEN" },
];

export function ExportPanel({
  years,
  departments,
  templates = [],
}: {
  years: number[];
  departments: Array<{ id: string; name: string }>;
  templates?: SavedTemplate[];
}) {
  const [year, setYear] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [saveReport, setSaveReport] = useState<string>("executiveOnePager");
  const [saveName, setSaveName] = useState<string>("");
  const [saveFormat, setSaveFormat] = useState<"PDF" | "XLSX">("PDF");
  const [saving, setSaving] = useState(false);

  const buildHref = (key: string, format: "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (year) params.set("year", year);
    if (color) params.set("color", color);
    if (deptId) params.set("deptId", deptId);
    return `/api/export/${key}?${params.toString()}`;
  };

  const handleSaveTemplate = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    const filters: Record<string, string | number> = {};
    if (year) filters.year = Number(year);
    if (color) filters.color = color;
    if (deptId) filters.deptId = deptId;
    const res = await createReportTemplate({
      key: `${saveReport}-${Date.now()}`,
      name: saveName.trim(),
      reportType: saveReport,
      config: { format: saveFormat, filters },
    });
    setSaving(false);
    if (res.success) {
      setSaveName("");
      window.location.reload();
    } else {
      alert(res.error);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Bu şablonu silmek istediğinize emin misiniz?")) return;
    const res = await deleteReportTemplate(id);
    if (res.success) window.location.reload();
    else alert(res.error);
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800 print-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Download size={18} className="text-blue-500" />
          Rapor Dışa Aktarma
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Yıl (Arşiv)</label>
            <Select value={year || "all"} onValueChange={(v) => setYear(v && v !== "all" ? v : "")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 w-36 text-sm">
                <SelectValue>{year || "Tüm yıllar"}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">Tüm yıllar</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">RAG Rengi</label>
            <Select value={color || "all"} onValueChange={(v) => setColor(v && v !== "all" ? v : "")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 w-36 text-sm">
                <SelectValue>{color || "Tüm renkler"}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {COLORS.map((c) => (
                  <SelectItem key={c.value || "all"} value={c.value || "all"}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {departments.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Departman</label>
              <Select value={deptId || "all"} onValueChange={(v) => setDeptId(v && v !== "all" ? v : "")}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 w-44 text-sm">
                  <SelectValue>
                    {departments.find((d) => d.id === deptId)?.name || "Tüm departmanlar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all">Tüm departmanlar</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex flex-col divide-y divide-zinc-800/70 border border-zinc-800 rounded-md">
          {REPORTS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-zinc-300">{r.label}</span>
              <div className="flex gap-2 shrink-0">
                <a
                  href={buildHref(r.key, "xlsx")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/20"
                >
                  <FileSpreadsheet size={14} />
                  Excel
                </a>
                <a
                  href={buildHref(r.key, "pdf")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-600/30 bg-rose-600/10 px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-600/20"
                >
                  <FileText size={14} />
                  PDF
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* FR-38: kayıtlı şablonlar — tek tıkla tekrar üretim */}
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <Bookmark size={14} className="text-amber-500" /> Kayıtlı Şablonlar
          </h4>
          {templates.length === 0 ? (
            <p className="text-xs text-zinc-600">Henüz şablon kaydedilmedi.</p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-800/70 border border-zinc-800 rounded-md">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-sm text-zinc-300">
                    {t.name} <span className="text-xs text-zinc-600">({t.reportType})</span>
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={`/api/export/_?template=${encodeURIComponent(t.key)}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/20"
                    >
                      <Download size={14} /> İndir ({t.format})
                    </a>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="inline-flex items-center rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mevcut filtreleri şablon olarak kaydet */}
          <div className="flex flex-wrap items-end gap-2 mt-1">
            <Input
              placeholder="Şablon adı"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9 w-44 text-sm"
            />
            <Select value={saveReport} onValueChange={(v) => setSaveReport(v || "executiveOnePager")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 w-52 text-sm">
                <SelectValue>{REPORTS.find((r) => r.key === saveReport)?.label ?? saveReport}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {REPORTS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={saveFormat} onValueChange={(v) => setSaveFormat(v === "XLSX" ? "XLSX" : "PDF")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 w-24 text-sm">
                <SelectValue>{saveFormat}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="PDF">PDF</SelectItem>
                <SelectItem value="XLSX">XLSX</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSaveTemplate}
              disabled={saving || !saveName.trim()}
              className="h-9 bg-zinc-800 hover:bg-zinc-700"
            >
              <Save size={14} className="mr-1.5" /> Şablon Kaydet
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
