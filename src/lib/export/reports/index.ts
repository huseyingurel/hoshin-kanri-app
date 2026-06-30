/**
 * Rapor kayıt barreli. Her `*.report.ts` modülü import edildiğinde kendini `registerReport`
 * ile kaydeder. Route bu modülü import ederek tüm raporları yükler. Yeni rapor eklerken
 * yalnız buraya bir import satırı ekleyin.
 */

import "@/lib/export/reports/executiveOnePager.report";
import "@/lib/export/reports/kpiStatus.report";
import "@/lib/export/reports/redKpiCountermeasures.report";
import "@/lib/export/reports/hoshinProgress.report";
import "@/lib/export/reports/openDecisions.report";
import "@/lib/export/reports/meetingMinutes.report";

export { getReport, REPORTS, type ReportContext, type ReportDef } from "@/lib/export/reports/registry";
