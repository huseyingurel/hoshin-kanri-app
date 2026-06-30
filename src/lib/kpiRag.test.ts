import { describe, expect, it } from "vitest";
import {
  computeKpiRagFromVariancePercent,
  computePercentVariance,
  resolveThresholds,
  shouldAutoOpenCountermeasure,
} from "@/lib/kpiRag";

const defaultThresholds = { amberThreshold: -5, redThreshold: -10 };

describe("computePercentVariance", () => {
  it("hedefe göre yüzde sapma", () => {
    expect(computePercentVariance(90, 100)).toBeCloseTo(-10);
    expect(computePercentVariance(100, 100)).toBe(0);
    expect(computePercentVariance(0, 100)).toBeCloseTo(-100);
  });

  it("hedef 0 ise sapma % 0", () => {
    expect(computePercentVariance(5, 0)).toBe(0);
  });
});

describe("computeKpiRagFromVariancePercent", () => {
  it("kırmızı: eşik ve altı", () => {
    expect(computeKpiRagFromVariancePercent(-10, defaultThresholds)).toBe("RED");
    expect(computeKpiRagFromVariancePercent(-15, defaultThresholds)).toBe("RED");
  });

  it("sarı: negatif ve amber eşiği ile kırmızı arası", () => {
    expect(computeKpiRagFromVariancePercent(-5, defaultThresholds)).toBe("AMBER");
    expect(computeKpiRagFromVariancePercent(-7, defaultThresholds)).toBe("AMBER");
  });

  it("yeşil: hedefin üzerinde veya hafif negatif (amber üstü)", () => {
    expect(computeKpiRagFromVariancePercent(0, defaultThresholds)).toBe("GREEN");
    expect(computeKpiRagFromVariancePercent(-4, defaultThresholds)).toBe("GREEN");
    expect(computeKpiRagFromVariancePercent(5, defaultThresholds)).toBe("GREEN");
  });

  it("pozitif sapma asla sarı olmaz (mevcut iş kuralı)", () => {
    expect(computeKpiRagFromVariancePercent(2, defaultThresholds)).toBe("GREEN");
  });
});

describe("shouldAutoOpenCountermeasure", () => {
  it("yalnızca RED", () => {
    expect(shouldAutoOpenCountermeasure("RED")).toBe(true);
    expect(shouldAutoOpenCountermeasure("AMBER")).toBe(false);
    expect(shouldAutoOpenCountermeasure("GREEN")).toBe(false);
  });
});

describe("resolveThresholds (FR-12 per-KPI override)", () => {
  it("KPI eşiği yoksa (null) varsayılanı kullanır", () => {
    expect(resolveThresholds({ redThreshold: null, amberThreshold: null }, defaultThresholds)).toEqual(
      defaultThresholds,
    );
    expect(resolveThresholds({}, defaultThresholds)).toEqual(defaultThresholds);
  });

  it("KPI eşiği varsa varsayılanı ezer (her eşik bağımsız)", () => {
    expect(resolveThresholds({ redThreshold: -20, amberThreshold: -8 }, defaultThresholds)).toEqual({
      redThreshold: -20,
      amberThreshold: -8,
    });
    // yalnız biri override
    expect(resolveThresholds({ redThreshold: -15, amberThreshold: null }, defaultThresholds)).toEqual({
      redThreshold: -15,
      amberThreshold: -5,
    });
  });

  it("override edilen eşik renk sonucunu değiştirir", () => {
    // -12 sapma: varsayılanda (-10 red) RED; KPI eşiği -15 red ise AMBER (-8 amber)
    const perKpi = resolveThresholds({ redThreshold: -15, amberThreshold: -8 }, defaultThresholds);
    expect(computeKpiRagFromVariancePercent(-12, defaultThresholds)).toBe("RED");
    expect(computeKpiRagFromVariancePercent(-12, perKpi)).toBe("AMBER");
  });
});
