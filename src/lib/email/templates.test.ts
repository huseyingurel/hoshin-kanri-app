import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";
import { NOTIFICATION_TYPES } from "@/lib/domainTypes";

describe("renderEmail", () => {
  it("her bildirim türü için konu/metin/HTML üretir", () => {
    for (const type of NOTIFICATION_TYPES) {
      const r = renderEmail(type, { title: "Başlık", body: "Gövde", link: "/x" });
      expect(r.subject).toContain("[Hoshin Kanri]");
      expect(r.subject).toContain("Başlık");
      expect(r.text).toContain("Gövde");
      expect(r.html).toContain("<h2>Başlık</h2>");
      expect(r.html).toContain("Ayrıntıyı görüntüle");
    }
  });

  it("HTML özel karakterleri kaçışlanır (enjeksiyon yok)", () => {
    const r = renderEmail("DECISION_ASSIGNED", { title: "<script>x</script>", body: "a & b" });
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("a &amp; b");
  });

  it("bilinmeyen tür → fırlatır (boş e-posta basmaz)", () => {
    // @ts-expect-error kasıtlı geçersiz tür
    expect(() => renderEmail("NOPE", { title: "x" })).toThrow();
  });
});
