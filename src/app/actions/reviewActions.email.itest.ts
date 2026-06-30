import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import { createDecision } from "@/app/actions/reviewActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";
import { captureLogEvents } from "../../../test/helpers/logSpy";

const origTransport = process.env.EMAIL_TRANSPORT;

describe("createDecision e-posta dikiş yeri (INV-10, entegrasyon)", () => {
  beforeEach(() => {
    h.userId = null;
  });
  afterEach(() => {
    h.userId = null;
    if (origTransport === undefined) delete process.env.EMAIL_TRANSPORT;
    else process.env.EMAIL_TRANSPORT = origTransport;
  });

  it("atanan karar: in-app bildirim YAZILIR ve email.sent loglanır", async () => {
    process.env.EMAIL_TRANSPORT = "log";
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await prisma.review.create({ data: { title: "T", type: "MEETING", date: new Date() } });

    const cap = captureLogEvents();
    await createDecision({ reviewId: review.id, decisionText: "Karar", assigneeId: seed.ownerId });
    cap.restore();

    // in-app bildirim (kaynak doğru) yazıldı
    const inApp = await prisma.notificationLog.findMany({
      where: { userId: seed.ownerId, type: "DECISION_ASSIGNED" },
    });
    expect(inApp.length).toBeGreaterThanOrEqual(1);

    // e-posta gönderimi loglandı
    const sent = cap.byEvent("email.sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "DECISION_ASSIGNED", transport: "log" });
  });

  it("yanlış yapılandırma: email.misconfigured loglanır ama in-app bildirim KORUNUR", async () => {
    process.env.EMAIL_TRANSPORT = "resend"; // uygulanmadı → misconfig
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await prisma.review.create({ data: { title: "T", type: "MEETING", date: new Date() } });

    const cap = captureLogEvents();
    await createDecision({ reviewId: review.id, decisionText: "Karar2", assigneeId: seed.ownerId });
    cap.restore();

    expect(cap.byEvent("email.misconfigured").length).toBeGreaterThanOrEqual(1);
    expect(cap.byEvent("email.sent")).toHaveLength(0);
    const inApp = await prisma.notificationLog.findMany({
      where: { userId: seed.ownerId, type: "DECISION_ASSIGNED" },
    });
    expect(inApp.length).toBeGreaterThanOrEqual(1); // in-app kaybolmaz
  });
});
