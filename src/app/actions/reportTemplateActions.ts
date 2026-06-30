"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { isReportFormat, isReportKey, type ReportFormat } from "@/lib/domainTypes";
import type { ReportFilters } from "@/lib/export/filters";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export interface ReportTemplateConfig {
  filters: ReportFilters;
  sections?: string[];
  format: ReportFormat;
}

/** Şablon `config` JSON'unu doğrular (sessiz coercion yok; geçersizse açık hata). */
function validateConfig(raw: unknown): { ok: true; config: ReportTemplateConfig } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "config nesne olmalı" };
  const c = raw as Record<string, unknown>;
  if (!isReportFormat(c.format)) return { ok: false, error: `geçersiz format: ${String(c.format)}` };
  const filters = (c.filters ?? {}) as ReportFilters;
  if (typeof filters !== "object" || filters === null) return { ok: false, error: "filters nesne olmalı" };
  if (c.sections !== undefined && !Array.isArray(c.sections)) return { ok: false, error: "sections dizi olmalı" };
  return { ok: true, config: { filters, sections: c.sections as string[] | undefined, format: c.format } };
}

export async function createReportTemplate(input: {
  key: string;
  name: string;
  description?: string;
  reportType: string;
  config: unknown;
}): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session?.userId) return { success: false, error: "Oturum bulunamadı." };

  const key = input.key?.trim();
  if (!key) return { success: false, error: "Şablon anahtarı gerekli." };
  if (!input.name?.trim()) return { success: false, error: "Şablon adı gerekli." };
  if (!isReportKey(input.reportType)) {
    return { success: false, error: `geçersiz rapor türü: ${input.reportType}` };
  }
  const v = validateConfig(input.config);
  if (!v.ok) return { success: false, error: v.error };

  // key tenant-unique; çakışmayı typed hata olarak döndür.
  const existing = await prisma.reportTemplate.findUnique({ where: { key } });
  if (existing) return { success: false, error: `Bu anahtar zaten kullanımda: ${key}` };

  try {
    const row = await prisma.reportTemplate.create({
      data: {
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        reportType: input.reportType,
        config: v.config as unknown as object,
        createdById: session.userId,
      },
    });
    logEvent("info", "reportTemplate.created", { id: row.id, key, reportType: input.reportType });
    revalidatePath("/reports");
    return { success: true, data: { id: row.id } };
  } catch (e) {
    logEvent("error", "reportTemplate.failed", { message: e instanceof Error ? e.message : String(e) });
    return { success: false, error: "Şablon kaydedilemedi." };
  }
}

export async function deleteReportTemplate(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId) return { success: false, error: "Oturum bulunamadı." };
  try {
    await prisma.reportTemplate.delete({ where: { id } });
    logEvent("info", "reportTemplate.deleted", { id });
    revalidatePath("/reports");
    return { success: true };
  } catch (e) {
    logEvent("error", "reportTemplate.failed", { message: e instanceof Error ? e.message : String(e) });
    return { success: false, error: "Şablon silinemedi." };
  }
}

export async function listReportTemplates() {
  return prisma.reportTemplate.findMany({ orderBy: { createdAt: "desc" } });
}
