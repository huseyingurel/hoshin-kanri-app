import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { buildWorkbook } from "./excel";

describe("buildWorkbook", () => {
  it("PK ile başlayan bir xlsx Buffer üretir ve satırları korur", () => {
    const buf = buildWorkbook({
      sheets: [
        {
          name: "KPI",
          columns: ["Ad", "Hedef", "Durum"],
          rows: [
            { Ad: "Verimlilik", Hedef: 100, Durum: "GREEN" },
            { Ad: "Hız", Hedef: 50, Durum: "RED" },
          ],
        },
      ],
    });
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");

    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Ad: "Verimlilik", Hedef: 100, Durum: "GREEN" });
  });

  it("boş veri → yalnız başlık satırı (fırlatmaz)", () => {
    const buf = buildWorkbook({ sheets: [{ name: "Boş", columns: ["X", "Y"], rows: [] }] });
    const wb = xlsx.read(buf, { type: "buffer" });
    const aoa = xlsx.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[0]).toEqual(["X", "Y"]);
    expect(aoa).toHaveLength(1);
  });

  it("hiç sayfa yoksa varsayılan boş sayfa üretir", () => {
    const buf = buildWorkbook({ sheets: [] });
    const wb = xlsx.read(buf, { type: "buffer" });
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(1);
  });
});
