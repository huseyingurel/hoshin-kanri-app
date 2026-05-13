import { describe, expect, it } from "vitest";
import {
  computeKpiRagFromVariancePercent,
  computePercentVariance,
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
