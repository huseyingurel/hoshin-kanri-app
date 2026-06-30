import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import {
  createReportTemplate,
  deleteReportTemplate,
  listReportTemplates,
} from "@/app/actions/reportTemplateActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

describe("reportTemplateActions (entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  it("geçerli şablon oluşturur ve listeler", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const res = await createReportTemplate({
      key: "icra-2026",
      name: "İcra 2026",
      reportType: "executiveOnePager",
      config: { format: "PDF", filters: { year: 2026 } },
    });
    expect(res.success).toBe(true);
    const list = await listReportTemplates();
    expect(list.find((t) => t.key === "icra-2026")).toBeTruthy();
  });

  it("aynı key ile çakışmada typed hata döner", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    await createReportTemplate({ key: "dup", name: "A", reportType: "kpiStatus", config: { format: "XLSX", filters: {} } });
    const res = await createReportTemplate({ key: "dup", name: "B", reportType: "kpiStatus", config: { format: "XLSX", filters: {} } });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/anahtar/i);
  });

  it("geçersiz format / rapor türü reddedilir (coerce edilmez)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const badFormat = await createReportTemplate({ key: "x1", name: "X", reportType: "kpiStatus", config: { format: "DOCX", filters: {} } });
    expect(badFormat.success).toBe(false);
    const badType = await createReportTemplate({ key: "x2", name: "X", reportType: "nonsense", config: { format: "PDF", filters: {} } });
    expect(badType.success).toBe(false);
  });

  it("oturum yoksa şablon oluşturulmaz", async () => {
    h.userId = null;
    const res = await createReportTemplate({ key: "noauth", name: "X", reportType: "kpiStatus", config: { format: "PDF", filters: {} } });
    expect(res.success).toBe(false);
  });

  it("şablonu siler", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const created = await createReportTemplate({ key: "del", name: "D", reportType: "kpiStatus", config: { format: "XLSX", filters: {} } });
    expect(created.success).toBe(true);
    const id = created.success ? created.data!.id : "";
    const res = await deleteReportTemplate(id);
    expect(res.success).toBe(true);
    expect((await listReportTemplates()).find((t) => t.key === "del")).toBeUndefined();
  });
});
