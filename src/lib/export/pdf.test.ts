import { describe, expect, it } from "vitest";
import { buildPdf } from "./pdf";

describe("buildPdf", () => {
  it("%PDF ile başlayan bir Buffer üretir (Türkçe glifler dahil)", async () => {
    const buf = await buildPdf({
      title: "Çğşöü İıĞ — Rapor",
      subtitle: "Türkçe alt başlık",
      meta: ["Yıl: 2026", "Departman: Üretim"],
      sections: [
        { heading: "Özet", paragraphs: ["Bu rapor şğçöü gibi Türkçe karakterler içerir."] },
        {
          heading: "Tablo",
          table: {
            columns: ["KPI", "Hedef", "Durum"],
            rows: [
              ["Üretim Verimliliği", 100, "GREEN"],
              ["Çevrim Süresi", 50, "RED"],
            ],
          },
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("boş bölüm listesiyle de geçerli PDF üretir", async () => {
    const buf = await buildPdf({ title: "Boş", sections: [] });
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
