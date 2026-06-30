import { describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { getReport, type ReportContext } from "@/lib/export/reports";
import type { UserScope } from "@/lib/dataScope";
import { seedReportingData } from "../../../../test/fixtures/seedReportingData";

const report = getReport("meetingMinutes")!;
const pmo = (id: string): UserScope => ({ id, role: "PMO", departmentId: null });

describe("meetingMinutes raporu (entegrasyon)", () => {
  it("reviewId verilmezse açık hata fırlatır (boş tutanak basmaz)", async () => {
    const seed = await seedReportingData(prisma);
    const ctx: ReportContext = { db: prisma, scope: pmo(seed.pmoId), filters: {} };
    await expect(report.fetch(ctx)).rejects.toThrow(/reviewId/i);
  });

  it("review'in tüm kararlarını tutanağa dökеr", async () => {
    const seed = await seedReportingData(prisma);
    const ctx: ReportContext = { db: prisma, scope: pmo(seed.pmoId), filters: { reviewId: seed.reviewId } };
    const data = (await report.fetch(ctx)) as { decisions: unknown[]; title: string };
    expect(data.decisions).toHaveLength(2); // seed: 1 açık + 1 kapalı karar
    expect(data.title).toBe("Aylık İcra Kurulu");
  });
});
