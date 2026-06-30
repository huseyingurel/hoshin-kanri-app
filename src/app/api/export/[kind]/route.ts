/**
 * Dışa aktarma uç noktası (FR-46/35/36/37) — ikili çıktının TEK aracı. App Router'da
 * Server Action ikili akış döndüremez; tüm dosya indirmeleri buradan geçer.
 *
 * Kimlik: sayfalardaki ile aynı oturum kapısı. Yetki: `reportScopeBundle` üzerinden rol
 * kapsamı (filtreler yalnız daraltır). Hata: 4xx/5xx + JSON gövde + `export.failed` logu —
 * asla kısmi/boş dosyayı tam dosya gibi yayınlamaz (INV-8).
 *
 * Örnek: GET /api/export/kpiStatus?format=xlsx&year=2026&deptId=...
 */

import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import type { UserScope } from "@/lib/dataScope";
import { parseReportFilters, FilterParseError } from "@/lib/export/filters";
import { buildWorkbook, type WorkbookSpec } from "@/lib/export/excel";
import { buildPdf, type PdfSpec } from "@/lib/export/pdf";
import { getReport, type ReportContext } from "@/lib/export/reports";

export const dynamic = "force-dynamic";

function workbookRowCount(spec: WorkbookSpec): number {
  return spec.sheets.reduce((n, s) => n + s.rows.length, 0);
}
function pdfRowCount(spec: PdfSpec): number {
  return spec.sections.reduce((n, s) => n + (s.table?.rows.length ?? 0), 0);
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();

  const session = await getSession();
  if (!session?.userId) {
    return Response.json({ error: "yetkisiz" }, { status: 401 });
  }

  let filters;
  try {
    filters = parseReportFilters(url.searchParams);
  } catch (e) {
    if (e instanceof FilterParseError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) {
    return Response.json({ error: "kullanıcı bulunamadı" }, { status: 401 });
  }
  const scope: UserScope = { id: dbUser.id, role: dbUser.role, departmentId: dbUser.departmentId };
  const ctx: ReportContext = { db: prisma, scope, filters };

  // Phase 0 kabul testi: gömülü demo çıktısı (font + xlsx yolu doğrulaması).
  if (kind === "ping") {
    return respond(kind, format, async () => {
      if (format === "pdf") {
        return {
          buffer: await buildPdf({
            title: "Çğşöü İıĞ — PDF Türkçe Testi",
            sections: [{ paragraphs: ["Bu bir PDF üretim doğrulamasıdır."] }],
          }),
          rowCount: 0,
        };
      }
      const spec: WorkbookSpec = {
        sheets: [{ name: "Ping", columns: ["A", "B"], rows: [{ A: "şğç", B: 1 }, { A: "öü", B: 2 }] }],
      };
      return { buffer: buildWorkbook(spec), rowCount: workbookRowCount(spec) };
    }, scope.id);
  }

  const report = getReport(kind);
  if (!report) {
    return Response.json({ error: `bilinmeyen rapor: ${kind}` }, { status: 404 });
  }

  return respond(kind, format, async () => {
    const data = await report.fetch(ctx);
    if (format === "pdf") {
      const spec = report.toPdf(data, ctx);
      return { buffer: await buildPdf(spec), rowCount: pdfRowCount(spec) };
    }
    const spec = report.toWorkbook(data, ctx);
    return { buffer: buildWorkbook(spec), rowCount: workbookRowCount(spec) };
  }, scope.id);
}

/** Ortak yanıt sarmalayıcı: hata → 500 + `export.failed`; başarı → `export.generated` + dosya. */
async function respond(
  kind: string,
  format: string,
  build: () => Promise<{ buffer: Buffer; rowCount: number }>,
  actorUserId: string,
): Promise<Response> {
  if (format !== "xlsx" && format !== "pdf") {
    return Response.json({ error: `geçersiz biçim: ${format}` }, { status: 400 });
  }
  try {
    const { buffer, rowCount } = await build();
    logEvent("info", "export.generated", { kind, format, rowCount, actorUserId });
    const ext = format === "pdf" ? "pdf" : "xlsx";
    const mime =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${kind}-${stamp}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logEvent("error", "export.failed", {
      kind,
      format,
      message: e instanceof Error ? e.message : String(e),
    });
    return Response.json({ error: "rapor üretilemedi" }, { status: 500 });
  }
}
