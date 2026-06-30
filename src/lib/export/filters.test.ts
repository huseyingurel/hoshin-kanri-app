import { describe, expect, it } from "vitest";
import { parseReportFilters, FilterParseError } from "./filters";

const p = (q: string) => new URLSearchParams(q);

describe("parseReportFilters", () => {
  it("geçerli parametreleri ayrıştırır", () => {
    const f = parseReportFilters(p("year=2026&color=RED&deptId=d1&hoshinId=h1&reviewId=r1"));
    expect(f).toEqual({ year: 2026, color: "RED", deptId: "d1", hoshinId: "h1", reviewId: "r1" });
  });

  it("eksik/boş parametreleri atlar", () => {
    expect(parseReportFilters(p(""))).toEqual({});
    expect(parseReportFilters(p("year=&color="))).toEqual({});
  });

  it("geçersiz yılı reddeder (coerce etmez)", () => {
    expect(() => parseReportFilters(p("year=abc"))).toThrow(FilterParseError);
    expect(() => parseReportFilters(p("year=1999"))).toThrow(FilterParseError);
    expect(() => parseReportFilters(p("year=2026.5"))).toThrow(FilterParseError);
  });

  it("geçersiz rengi reddeder (coerce etmez)", () => {
    expect(() => parseReportFilters(p("color=BLUE"))).toThrow(FilterParseError);
    expect(() => parseReportFilters(p("color=red"))).toThrow(FilterParseError); // büyük/küçük duyarlı
  });
});
