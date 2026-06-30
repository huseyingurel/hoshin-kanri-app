import { afterEach, describe, expect, it } from "vitest";
import { deliverEmail } from "./index";
import { captureLogEvents } from "../../../test/helpers/logSpy";

const origTransport = process.env.EMAIL_TRANSPORT;

describe("deliverEmail (dikiş yeri)", () => {
  afterEach(() => {
    if (origTransport === undefined) delete process.env.EMAIL_TRANSPORT;
    else process.env.EMAIL_TRANSPORT = origTransport;
  });

  it("log taşıyıcısı: email.sent loglar ve teslim eder", async () => {
    process.env.EMAIL_TRANSPORT = "log";
    const cap = captureLogEvents();
    const res = await deliverEmail({ to: "a@test.local", type: "DECISION_ASSIGNED", ctx: { title: "T" } });
    cap.restore();
    expect(res?.delivered).toBe(true);
    const sent = cap.byEvent("email.sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a@test.local", type: "DECISION_ASSIGNED", transport: "log" });
  });

  it("yanlış yapılandırma: email.misconfigured loglar, fırlatmaz, null döner (in-app korunur)", async () => {
    process.env.EMAIL_TRANSPORT = "resend"; // henüz uygulanmadı
    const cap = captureLogEvents();
    const res = await deliverEmail({ to: "a@test.local", type: "DECISION_ASSIGNED", ctx: { title: "T" } });
    cap.restore();
    expect(res).toBeNull();
    expect(cap.byEvent("email.misconfigured")).toHaveLength(1);
    expect(cap.byEvent("email.sent")).toHaveLength(0);
  });

  it("alıcı yoksa atlar (email.skipped_no_recipient)", async () => {
    const cap = captureLogEvents();
    const res = await deliverEmail({ to: null, type: "DECISION_ASSIGNED", ctx: { title: "T" } });
    cap.restore();
    expect(res).toBeNull();
    expect(cap.byEvent("email.skipped_no_recipient")).toHaveLength(1);
  });
});
