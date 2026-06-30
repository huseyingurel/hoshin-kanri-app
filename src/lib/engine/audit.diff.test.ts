import { describe, expect, it } from "vitest";
import { diff } from "@/lib/engine/audit";

describe("diff", () => {
  it("değişen alanı yakalar, eşit alanı atlar", () => {
    const before = { status: "OPEN", title: "Aynı" };
    const after = { status: "CLOSED", title: "Aynı" };
    expect(diff(before, after, ["status", "title"])).toEqual([
      { field: "status", old: "OPEN", new: "CLOSED" },
    ]);
  });

  it("eklenen alan (undefined → değer)", () => {
    expect(diff({}, { note: "yeni" }, ["note"])).toEqual([
      { field: "note", old: null, new: "yeni" },
    ]);
  });

  it("kaldırılan alan (değer → undefined) null'a düşer", () => {
    expect(diff({ note: "vardı" }, {}, ["note"])).toEqual([
      { field: "note", old: "vardı", new: null },
    ]);
  });

  it("null ve undefined eşdeğer sayılır (değişiklik üretmez)", () => {
    expect(diff({ a: null }, { a: undefined }, ["a"])).toEqual([]);
  });

  it("0/false/'' gibi falsy değerler null'dan farklıdır", () => {
    expect(diff({ a: null }, { a: 0 }, ["a"])).toEqual([{ field: "a", old: null, new: 0 }]);
    expect(diff({ a: null }, { a: false }, ["a"])).toEqual([{ field: "a", old: null, new: false }]);
  });

  it("eşit Date değerleri değişiklik üretmez; farklı Date'ler ISO olarak listelenir", () => {
    const d1 = new Date("2026-05-01T00:00:00.000Z");
    const d2 = new Date("2026-05-01T00:00:00.000Z");
    expect(diff({ due: d1 }, { due: d2 }, ["due"])).toEqual([]);

    const d3 = new Date("2026-06-01T00:00:00.000Z");
    expect(diff({ due: d1 }, { due: d3 }, ["due"])).toEqual([
      { field: "due", old: "2026-05-01T00:00:00.000Z", new: "2026-06-01T00:00:00.000Z" },
    ]);
  });

  it("yalnızca verilen alanlara bakar", () => {
    const before = { a: 1, b: 2 };
    const after = { a: 9, b: 9 };
    expect(diff(before, after, ["a"])).toEqual([{ field: "a", old: 1, new: 9 }]);
  });

  it("null/undefined nesneleri güvenle ele alır", () => {
    expect(diff(null, { a: 1 }, ["a"])).toEqual([{ field: "a", old: null, new: 1 }]);
    expect(diff(undefined, undefined, ["a"])).toEqual([]);
  });
});
