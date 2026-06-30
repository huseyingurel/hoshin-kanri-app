"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseImportFile,
  previewImport,
  commitImport,
  defaultMapping,
} from "@/app/actions/importActions";
import type { RawRow } from "@/lib/import/parse";
import type { ColumnMapping } from "@/lib/import/mapping";
import type { ImportPlan, PlanCreate, PlanUpdate, PlanDupe } from "@/lib/import/plan";
import type { RowError, NormalizedRow } from "@/lib/import/normalize";

// ---------------------------------------------------------------------------
// Tip tanımları
// ---------------------------------------------------------------------------

type Step = "upload" | "mapping" | "preview" | "result";

interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
}

// Önizleme tablosu için birleşik satır tipi
type DisplayRow =
  | { status: "create"; row: NormalizedRow }
  | { status: "update"; row: NormalizedRow; kpiId: string }
  | { status: "dupe";   row: NormalizedRow; kpiId: string }
  | { status: "error";  error: RowError };

// ---------------------------------------------------------------------------
// Yardımcı bileşenler
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<DisplayRow["status"], string> = {
  create: "Yeni",
  update: "Güncelle",
  dupe:   "Atla",
  error:  "Hata",
};

const STATUS_CLASSES: Record<DisplayRow["status"], string> = {
  create: "bg-green-100 text-green-800 border-green-200",
  update: "bg-blue-100 text-blue-800 border-blue-200",
  dupe:   "bg-amber-100 text-amber-800 border-amber-200",
  error:  "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ status }: { status: DisplayRow["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// Mantıksal alan etiketleri
const FIELD_LABELS: Array<{ key: keyof ColumnMapping; label: string; required: boolean }> = [
  { key: "hoshin",         label: "Hoshin",             required: true },
  { key: "majorTask",      label: "Ana Görev",           required: true },
  { key: "actionPlan",     label: "Aksiyon Planı",       required: true },
  { key: "kpiName",        label: "KPI Adı",             required: true },
  { key: "department",     label: "Sorumlu Departman",   required: true },
  { key: "target",         label: "Hedef Değer",         required: true },
  { key: "frequency",      label: "Raporlama Sıklığı",   required: true },
  { key: "unit",           label: "Birim (opsiyonel)",   required: false },
  { key: "year",           label: "Yıl (opsiyonel)",     required: false },
  { key: "kpiDescription", label: "KPI Açıklama (ops.)", required: false },
];

// ---------------------------------------------------------------------------
// Ana bileşen
// ---------------------------------------------------------------------------

export function ImportWizardClient() {
  const [step, setStep]       = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows]       = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    hoshin: "", majorTask: "", actionPlan: "", kpiName: "",
    department: "", target: "", frequency: "",
  });
  const [plan, setPlan]       = useState<ImportPlan | null>(null);
  const [result, setResult]   = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Adım 1: Dosya yükleme
  // -------------------------------------------------------------------------

  async function handleFileUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await parseImportFile(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setHeaders(res.headers);
      setRows(res.rows);
      const auto = defaultMapping(res.headers);
      setMapping(auto);
      setStep("mapping");
    } catch {
      setError("Dosya yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Adım 2: Sütun eşleme → önizleme
  // -------------------------------------------------------------------------

  async function handlePreview() {
    setError(null);
    setLoading(true);
    try {
      const p = await previewImport(rows, mapping);
      setPlan(p);
      setStep("preview");
    } catch {
      setError("Önizleme oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Adım 3: Onayla → commit
  // -------------------------------------------------------------------------

  async function handleCommit() {
    if (!plan) return;
    setError(null);
    setLoading(true);
    try {
      const res = await commitImport(plan);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult({ created: res.created, updated: res.updated, skipped: res.skipped });
      setStep("result");
    } catch {
      setError("İçe aktarım başarısız oldu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Sıfırla
  // -------------------------------------------------------------------------

  function handleReset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({ hoshin: "", majorTask: "", actionPlan: "", kpiName: "", department: "", target: "", frequency: "" });
    setPlan(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Önizleme tablosu için DisplayRow listesi
  // -------------------------------------------------------------------------

  function buildDisplayRows(p: ImportPlan): DisplayRow[] {
    const all: DisplayRow[] = [
      ...p.creates.map((c: PlanCreate) => ({ status: "create" as const, row: c.row })),
      ...p.updates.map((u: PlanUpdate) => ({ status: "update" as const, row: u.row, kpiId: u.existingKpiId })),
      ...p.dupes.map((d: PlanDupe)   => ({ status: "dupe" as const, row: d.row, kpiId: d.existingKpiId })),
      ...p.errors.map((er: RowError) => ({ status: "error" as const, error: er })),
    ];
    return all.sort((a, b) => {
      const ai = a.status === "error" ? a.error.rowIndex : a.row.rowIndex;
      const bi = b.status === "error" ? b.error.rowIndex : b.row.rowIndex;
      return ai - bi;
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* İlerleme göstergesi */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {(["upload", "mapping", "preview", "result"] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = {
            upload:  "1. Dosya",
            mapping: "2. Sütunlar",
            preview: "3. Önizleme",
            result:  "4. Sonuç",
          };
          const active = s === step;
          const done =
            (s === "upload"  && ["mapping","preview","result"].includes(step)) ||
            (s === "mapping" && ["preview","result"].includes(step)) ||
            (s === "preview" && step === "result");
          return (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-muted-foreground/40">›</span>}
              <span className={active ? "font-semibold text-foreground" : done ? "text-muted-foreground line-through" : ""}>
                {labels[s]}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Hata mesajı */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ADIM 1: Yükleme */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Excel Dosyası Yükle</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="file-input">
                  XLSX dosyası seçin
                </label>
                <input
                  id="file-input"
                  name="file"
                  type="file"
                  accept=".xlsx,.xls"
                  required
                  className="block w-full text-sm text-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-sm file:font-medium file:bg-muted hover:file:bg-muted/80 cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                İlk sayfa kullanılır. Beklenen sütunlar: Hoshin, Major Tasks, Action Plan, KPI, Resp. Dept., FY2026 Target, Reporting Frequency.
              </p>
              <Button type="submit" disabled={loading}>
                {loading ? "Yükleniyor…" : "Devam Et"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ADIM 2: Sütun eşleme */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle>Sütun Eşleme</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Dosyadaki sütunları mantıksal alanlara eşleyin. Varsayılanlar otomatik algılandı.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELD_LABELS.map(({ key, label, required }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <select
                    className="w-full rounded-lg border border-input bg-transparent py-1.5 px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    value={mapping[key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [key]: e.target.value }))
                    }
                  >
                    <option value="">— Eşleştirilmedi —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep("upload")} disabled={loading}>
                Geri
              </Button>
              <Button
                onClick={handlePreview}
                disabled={
                  loading ||
                  !mapping.hoshin ||
                  !mapping.majorTask ||
                  !mapping.actionPlan ||
                  !mapping.kpiName ||
                  !mapping.department ||
                  !mapping.target ||
                  !mapping.frequency
                }
              >
                {loading ? "Önizleniyor…" : "Önizle"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ADIM 3: Önizleme */}
      {step === "preview" && plan && (() => {
        const displayRows = buildDisplayRows(plan);
        const summary = {
          create: plan.creates.length,
          update: plan.updates.length,
          dupe:   plan.dupes.length,
          error:  plan.errors.length,
        };
        return (
          <div className="space-y-4">
            {/* Özet */}
            <Card>
              <CardHeader>
                <CardTitle>İçe Aktarım Önizlemesi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status="create" />
                    <span>{summary.create} yeni KPI</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status="update" />
                    <span>{summary.update} güncellenecek</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status="dupe" />
                    <span>{summary.dupe} atlanacak</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status="error" />
                    <span>{summary.error} hatalı satır</span>
                  </span>
                </div>
                {summary.error > 0 && (
                  <p className="mt-3 text-xs text-amber-700">
                    Hatalı satırlar commit edilmez; geri kalanlar işlenir.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tablo */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="w-20">Durum</TableHead>
                      <TableHead>Hoshin</TableHead>
                      <TableHead>Ana Görev</TableHead>
                      <TableHead>Aksiyon Planı</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Departman</TableHead>
                      <TableHead>Hedef</TableHead>
                      <TableHead>Sıklık</TableHead>
                      <TableHead>Açıklama</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map((dr, i) => {
                      if (dr.status === "error") {
                        return (
                          <TableRow key={i} className="bg-red-50/50">
                            <TableCell>{dr.error.rowIndex + 1}</TableCell>
                            <TableCell><StatusBadge status="error" /></TableCell>
                            <TableCell colSpan={7} className="text-red-700 text-xs italic whitespace-normal">
                              [{dr.error.field}] {dr.error.reason}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      }
                      const row = dr.row;
                      return (
                        <TableRow key={i}>
                          <TableCell>{row.rowIndex + 1}</TableCell>
                          <TableCell><StatusBadge status={dr.status} /></TableCell>
                          <TableCell className="max-w-[10rem] truncate" title={row.hoshinTitle}>{row.hoshinTitle}</TableCell>
                          <TableCell className="max-w-[8rem] truncate" title={row.majorTaskTitle}>{row.majorTaskTitle}</TableCell>
                          <TableCell className="max-w-[8rem] truncate" title={row.actionPlanTitle}>{row.actionPlanTitle}</TableCell>
                          <TableCell className="max-w-[8rem] truncate" title={row.kpiName}>{row.kpiName}</TableCell>
                          <TableCell>{row.departmentNames.join(", ")}</TableCell>
                          <TableCell>{row.targetValue} {row.unit}</TableCell>
                          <TableCell>{row.reportingFrequency}</TableCell>
                          <TableCell className="max-w-[8rem] truncate text-muted-foreground" title={row.kpiDescription || undefined}>{row.kpiDescription || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Eylemler */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("mapping")} disabled={loading}>
                Geri
              </Button>
              <Button
                onClick={handleCommit}
                disabled={loading || (summary.create === 0 && summary.update === 0)}
              >
                {loading
                  ? "Kaydediliyor…"
                  : `Onayla ve Aktar (${summary.create + summary.update} kayıt)`}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ADIM 4: Sonuç */}
      {step === "result" && result && (
        <Card>
          <CardHeader>
            <CardTitle>İçe Aktarım Tamamlandı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <div className="text-2xl font-bold text-green-700">{result.created}</div>
                <div className="text-green-600">yeni KPI oluşturuldu</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="text-2xl font-bold text-blue-700">{result.updated}</div>
                <div className="text-blue-600">KPI güncellendi</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-2xl font-bold text-amber-700">{result.skipped}</div>
                <div className="text-amber-600">kayıt atlandı</div>
              </div>
            </div>
            <Button onClick={handleReset}>Yeni İçe Aktarım</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
