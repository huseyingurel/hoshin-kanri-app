/**
 * Saf PDF üretimi (pdfkit) — Prisma yok. Türkçe glifler (ş/ğ/İ/ı/ö/ü/ç) için DejaVuSans
 * TTF gömülür; varsayılan Helvetica AFM bu glifleri taşımaz.
 *
 * Felsefe: font yüklenemezse `buildPdf` **fırlatır** (route → 500). Eksik glif yerine
 * sessizce kutu (tofu) basmaktansa açıkça başarısız olur.
 */

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

export interface PdfTable {
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

export interface PdfSection {
  heading?: string;
  paragraphs?: string[];
  table?: PdfTable;
}

export interface PdfSpec {
  title: string;
  subtitle?: string;
  /** Üst-bilgi satırları (ör. "Yıl: 2026", "Departman: Üretim"). */
  meta?: string[];
  sections: PdfSection[];
}

const FONT_DIR = path.join(process.cwd(), "src", "lib", "export", "fonts");
const REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

/** Font dosyalarını okur; bulunamazsa açık hata fırlatır (sessiz tofu yok). */
function loadFonts(): { regular: Buffer; bold: Buffer } {
  try {
    return { regular: fs.readFileSync(REGULAR), bold: fs.readFileSync(BOLD) };
  } catch (e) {
    throw new Error(
      `PDF Türkçe fontu yüklenemedi (${REGULAR}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

const MARGIN = 48;

/** PdfSpec → PDF Buffer (`%PDF` ile başlar). */
export function buildPdf(spec: PdfSpec): Promise<Buffer> {
  const { regular, bold } = loadFonts();

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("body", regular);
      doc.registerFont("bold", bold);

      // Başlık
      doc.font("bold").fontSize(18).fillColor("#111111").text(spec.title);
      if (spec.subtitle) {
        doc.moveDown(0.2).font("body").fontSize(11).fillColor("#555555").text(spec.subtitle);
      }
      if (spec.meta && spec.meta.length > 0) {
        doc.moveDown(0.2).font("body").fontSize(9).fillColor("#777777").text(spec.meta.join("  •  "));
      }
      doc.moveDown(0.8);

      for (const section of spec.sections) {
        renderSection(doc, section);
      }

      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function renderSection(doc: PDFKit.PDFDocument, section: PdfSection): void {
  if (section.heading) {
    ensureSpace(doc, 28);
    doc.font("bold").fontSize(13).fillColor("#111111").text(section.heading);
    doc.moveDown(0.3);
  }
  for (const p of section.paragraphs ?? []) {
    doc.font("body").fontSize(10).fillColor("#333333").text(p);
    doc.moveDown(0.2);
  }
  if (section.table) {
    renderTable(doc, section.table);
  }
  doc.moveDown(0.6);
}

/** Sabit-genişlikli basit tablo: başlık satırı kalın, satırlar çizgili. */
function renderTable(doc: PDFKit.PDFDocument, table: PdfTable): void {
  const cols = table.columns;
  if (cols.length === 0) return;
  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const width = right - left;
  const colWidth = width / cols.length;
  const rowH = 18;

  const drawRow = (cells: Array<string | number | null | undefined>, bold: boolean) => {
    ensureSpace(doc, rowH);
    const y = doc.y;
    doc.font(bold ? "bold" : "body").fontSize(8.5).fillColor(bold ? "#111111" : "#333333");
    cells.forEach((cell, i) => {
      const text = cell == null ? "" : String(cell);
      doc.text(text, left + i * colWidth + 3, y + 4, { width: colWidth - 6, height: rowH, ellipsis: true });
    });
    doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor("#dddddd").lineWidth(0.5).stroke();
    doc.y = y + rowH;
  };

  drawRow(cols, true);
  for (const row of table.rows) {
    drawRow(row, false);
  }
}

/** Sayfa sonuna yaklaşıldıysa yeni sayfa açar. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage();
  }
}
