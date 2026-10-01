import {
  calculateTireServiceTotal,
  defaultTirePricingRule,
  type TireServicePricingRule,
} from "@/lib/tire-pricing";

function ruleWith(overrides: Partial<TireServicePricingRule> = {}): TireServicePricingRule {
  return {
    ...defaultTirePricingRule("catalog-1"),
    baseInstallationPrice: 25,
    mountBalancePrice: 20,
    tpmsServicePrice: 8,
    disposalPrice: 5,
    alignmentPrice: 90,
    ...overrides,
  };
}

describe("tire-pricing", () => {
  describe("defaultTirePricingRule", () => {
    it("returns safe defaults for a new catalog entry", () => {
      const rule = defaultTirePricingRule("catalog-9");
      expect(rule.serviceCatalogId).toBe("catalog-9");
      expect(rule.baseInstallationPrice).toBe(0);
      expect(rule.minimumQuantity).toBe(1);
      expect(rule.maximumQuantity).toBe(4);
      expect(rule.requiresFitmentLookup).toBe(true);
      expect(rule.allowsManualFitment).toBe(true);
      expect(rule.allowsStaggeredFitment).toBe(false);
      expect(rule.durationMinutesPerTire).toBe(30);
    });
  });

  describe("calculateTireServiceTotal", () => {
    it("charges base installation per tire", () => {
      expect(calculateTireServiceTotal(ruleWith(), 4)).toBe(100);
    });

    it("adds per-tire options multiplied by quantity", () => {
      expect(
        calculateTireServiceTotal(ruleWith(), 4, {
          mountBalance: true,
          tpms: true,
          disposal: true,
        }),
      ).toBe(100 + 80 + 32 + 20);
    });

    it("charges alignment once per job, not per tire", () => {
      expect(calculateTireServiceTotal(ruleWith(), 4, { alignment: true })).toBe(100 + 90);
      expect(calculateTireServiceTotal(ruleWith(), 2, { alignment: true })).toBe(50 + 90);
    });

    it("treats omitted options as disabled", () => {
      expect(calculateTireServiceTotal(ruleWith(), 1, {})).toBe(25);
    });

    it("handles zero quantity without producing NaN", () => {
      expect(calculateTireServiceTotal(ruleWith(), 0, { mountBalance: true })).toBe(0);
    });
  });
});
