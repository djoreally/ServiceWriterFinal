import {
  bankersRound,
  computeFees,
  computeFinancialSummary,
  dollarsToCents,
  centsToDollars,
  toCents,
  toDollars,
  formatCentsAsCurrency,
  formatDollarsAsCurrency,
} from "@/lib/financialMath";

describe("financialMath trust boundaries", () => {
  describe("bankersRound", () => {
    it("uses round-half-to-even to avoid systematic overcharging", () => {
      expect(bankersRound(2.445, 2)).toBe(2.44);
      expect(bankersRound(2.455, 2)).toBe(2.46);
      expect(bankersRound(2.465, 2)).toBe(2.46);
      expect(bankersRound(2.475, 2)).toBe(2.48);
    });
  });

  describe("computeFees", () => {
    it("computes surcharge percentage from subtotal + waste + shop base", () => {
      const fees = computeFees(
        {
          waste_oil_fee_enabled: true,
          waste_oil_fee: 2,
          shop_fee_enabled: true,
          shop_fee_type: "fixed",
          shop_fee_value: 3,
          surcharge_enabled: true,
          surcharge_type: "percentage",
          surcharge_value: 10,
        },
        100,
      );

      // surcharge base is 100 + 2 + 3 = 105, so 10% = 10.50
      expect(fees).toEqual({
        wasteOilFee: 2,
        shopFee: 3,
        surcharge: 10.5,
        totalFees: 15.5,
      });
    });
  });

  describe("computeFinancialSummary", () => {
    it("caps discount at subtotal and never produces negative taxable amount", () => {
      const summary = computeFinancialSummary({
        subtotal: 50,
        discount: 500,
        taxRate: 0.1,
      });

      expect(summary.discount).toBe(50);
      expect(summary.taxableAmount).toBe(0);
      expect(summary.tax).toBe(0);
      expect(summary.total).toBe(0);
    });

    it("prefers explicit taxAmount over computed taxRate", () => {
      const summary = computeFinancialSummary({
        subtotal: 100,
        taxAmount: 9.99,
        taxRate: 0.5,
      });

      expect(summary.tax).toBe(9.99);
      expect(summary.total).toBe(109.99);
    });
  });

  describe("currency conversion", () => {
    it("round-trips dollars to cents using banker-rounded dollars", () => {
      const cents = dollarsToCents(toDollars(125.455));
      expect(cents).toBe(12546);
      expect(centsToDollars(cents)).toBe(125.46);
    });
  });

  describe("formatCentsAsCurrency", () => {
    it("formats cents as USD currency string by default", () => {
      expect(formatCentsAsCurrency(toCents(1999))).toBe("$19.99");
      expect(formatCentsAsCurrency(toCents(0))).toBe("$0.00");
      expect(formatCentsAsCurrency(toCents(100000))).toBe("$1,000.00");
    });

    it("accepts an explicit currency code", () => {
      expect(formatCentsAsCurrency(toCents(1999), "EUR")).toBe("€19.99");
    });

    it("normalizes lowercase currency codes", () => {
      expect(formatCentsAsCurrency(toCents(5000), "usd")).toBe("$50.00");
    });

    it("respects an explicit locale", () => {
      expect(formatCentsAsCurrency(toCents(1999), "USD", "en-US")).toBe("$19.99");
    });
  });

  describe("formatDollarsAsCurrency", () => {
    it("formats dollar amounts as USD currency string by default", () => {
      expect(formatDollarsAsCurrency(19.99)).toBe("$19.99");
      expect(formatDollarsAsCurrency(0)).toBe("$0.00");
      expect(formatDollarsAsCurrency(1000)).toBe("$1,000.00");
    });

    it("accepts an explicit currency code", () => {
      expect(formatDollarsAsCurrency(19.99, "EUR")).toBe("€19.99");
    });

    it("normalizes lowercase currency codes", () => {
      expect(formatDollarsAsCurrency(50, "usd")).toBe("$50.00");
    });

    it("respects an explicit locale", () => {
      expect(formatDollarsAsCurrency(19.99, "USD", "en-US")).toBe("$19.99");
    });
  });
});
