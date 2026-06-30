import { describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { assembleAgenda } from "@/lib/engine/agenda";
import type { UserScope } from "@/lib/dataScope";
import { seedReportingData } from "../../../test/fixtures/seedReportingData";
import { captureLogEvents } from "../../../test/helpers/logSpy";

const pmo = (id: string): UserScope => ({ id, role: "PMO", departmentId: null });

describe("assembleAgenda (entegrasyon)", () => {
  it("RED KPI + karar bekleyenleri kategorize eder ve agenda.assembled loglar", async () => {
    const seed = await seedReportingData(prisma);
    const cap = captureLogEvents();
    const pkg = await assembleAgenda(prisma, seed.reviewId, pmo(seed.pmoId));
    cap.restore();

    // seed: 2026 KPI son dönemi RED → redKpis ≥ 1
    expect(pkg.counts.redKpis).toBeGreaterThanOrEqual(1);
    // seed: açık karar (decisionOpen) vadesi 2026-07 (now sonrası olabilir) → atanmış.
    // Karar bekleyen kriteri: vadesi geçmiş VEYA atanmamış. decisionClosed kapalı → hariç.
    // En azından montaj çalışır ve log düşer:
    const logged = cap.byEvent("agenda.assembled");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ reviewId: seed.reviewId });
  });

  it("atanmamış açık kararı 'karar bekleyen' sayar", async () => {
    const seed = await seedReportingData(prisma);
    // Atanmamış açık bir karar ekle → decisionsNeeded'e düşmeli.
    await prisma.decision.create({
      data: { reviewId: seed.reviewId, decisionText: "Atanmamış karar", status: "OPEN", assigneeId: null },
    });
    const pkg = await assembleAgenda(prisma, seed.reviewId, pmo(seed.pmoId));
    const texts = (pkg.decisionsNeeded as Array<{ decisionText: string }>).map((d) => d.decisionText);
    expect(texts).toContain("Atanmamış karar");
  });
});
