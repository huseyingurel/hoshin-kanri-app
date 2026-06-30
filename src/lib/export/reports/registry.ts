/**
 * Rapor kayıt defteri (FR-36). Her rapor `fetch/toWorkbook/toPdf` üçlüsünü uygular.
 *
 * Sınır kuralı: export/ modülleri **saf** kalır — `@/lib/prisma` singleton'ını import
 * ETMEZ. Veri erişimi, route tarafından `ReportContext.db` ile enjekte edilen istemci
 * üzerinden yapılır (yalnız `PrismaClient` *tipi* import edilir). Böylece raporlar DB'siz
 * birim testte de kurulabilir (sahte db enjekte edilir).
 */

import type { PrismaClient } from "@prisma/client";
import type { UserScope } from "@/lib/dataScope";
import type { ReportFilters } from "@/lib/export/filters";
import type { WorkbookSpec } from "@/lib/export/excel";
import type { PdfSpec } from "@/lib/export/pdf";
import type { ReportKey } from "@/lib/domainTypes";

/** Prisma okumalarını (read-only) destekleyen enjekte edilen istemci tipi. */
export type ReportDb = PrismaClient;

export interface ReportContext {
  db: ReportDb;
  scope: UserScope;
  filters: ReportFilters;
}

export interface ReportDef<T = unknown> {
  key: ReportKey;
  title: string;
  /** Kapsamlı + filtreli veri çeker (yalnız okuma). */
  fetch: (ctx: ReportContext) => Promise<T>;
  toWorkbook: (data: T, ctx: ReportContext) => WorkbookSpec;
  toPdf: (data: T, ctx: ReportContext) => PdfSpec;
}

/** Anahtar → rapor tanımı. Raporlar `registerReport` ile eklenir. */
export const REPORTS: Partial<Record<ReportKey, ReportDef>> = {};

export function registerReport<T>(def: ReportDef<T>): void {
  REPORTS[def.key] = def as ReportDef;
}

export function getReport(key: string): ReportDef | undefined {
  return (REPORTS as Record<string, ReportDef | undefined>)[key];
}
