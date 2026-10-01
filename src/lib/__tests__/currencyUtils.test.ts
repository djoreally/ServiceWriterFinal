import {
  addPaymentAndService,
  aggregatePayments,
  aggregateServices,
  calculateNetPayment,
  deriveOutstandingFromBilledAndCollected,
  toCents,
  toDollars,
  validatePaymentRecordCurrency,
  validateServiceRecordCurrency,
} from "@/lib/currencyUtils";

describe("currencyUtils", () => {
  describe("toCents", () => {
    it("converts dollars to cents", () => {
      expect(toCents(500)).toBe(50000);
      expect(toCents(125.5)).toBe(12550);
    });

    it("rounds fractional cents (banker-safe half-up via Math.round)", () => {
      expect(toCents(10.005)).toBe(1001);
      expect(toCents(10.004)).toBe(1000);
    });

    it("rejects invalid inputs", () => {
      expect(() => toCents(NaN)).toThrow("Invalid dollar amount");
      expect(() => toCents(Infinity)).toThrow("Invalid dollar amount");
      expect(() => toCents(-5)).toThrow("Negative amounts not allowed");
      expect(() => toCents(10_000_001)).toThrow("Amount exceeds maximum");
    });
  });

  describe("toDollars", () => {
    it("converts cents to dollars", () => {
      expect(toDollars(50000)).toBe(500);
      expect(toDollars(12550)).toBe(125.5);
    });

    it("rejects invalid inputs", () => {
      expect(() => toDollars(NaN)).toThrow("Invalid cent amount");
      expect(() => toDollars(-1)).toThrow("Negative amounts not allowed");
    });
  });

  describe("addPaymentAndService", () => {
    it("adds cents-denominated payments to dollar-denominated services", () => {
      // 50000 cents ($500) + $250 = $750 — the off-by-100x guard
      expect(addPaymentAndService(50000, 250)).toBe(750);
    });
  });

  describe("calculateNetPayment", () => {
    it("subtracts refunds from gross", () => {
      expect(calculateNetPayment(50000, 10000)).toBe(40000);
    });

    it("defaults refund to zero", () => {
      expect(calculateNetPayment(50000)).toBe(50000);
    });

    it("rejects refunds larger than the payment", () => {
      expect(() => calculateNetPayment(1000, 1001)).toThrow("exceeds payment amount");
    });
  });

  describe("aggregatePayments", () => {
    it("sums net payments and returns dollars", () => {
      const total = aggregatePayments([
        { amount: 50000 },
        { amount: 25000, refund_amount: 5000 },
      ]);
      expect(total).toBe(700);
    });

    it("returns zero for an empty list", () => {
      expect(aggregatePayments([])).toBe(0);
    });
  });

  describe("aggregateServices", () => {
    it("sums dollar-denominated service costs", () => {
      expect(aggregateServices([{ total_cost: 500 }, { total_cost: 250 }])).toBe(750);
    });
  });

  describe("deriveOutstandingFromBilledAndCollected", () => {
    it("returns billed minus collected", () => {
      expect(deriveOutstandingFromBilledAndCollected(1000, 400)).toBe(600);
    });

    it("floors at zero when collected exceeds billed (deposits/prepayments)", () => {
      expect(deriveOutstandingFromBilledAndCollected(400, 1000)).toBe(0);
    });

    it("rejects non-finite inputs", () => {
      expect(() => deriveOutstandingFromBilledAndCollected(NaN, 0)).toThrow("finite");
      expect(() => deriveOutstandingFromBilledAndCollected(0, Infinity)).toThrow("finite");
    });
  });

  describe("validatePaymentRecordCurrency", () => {
    it("accepts a well-formed integer-cents record", () => {
      expect(() =>
        validatePaymentRecordCurrency({ amount: 50000, refund_amount: 10000 }),
      ).not.toThrow();
    });

    it("warns (not throws) on fractional cents", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      validatePaymentRecordCurrency({ amount: 50000.5 });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("throws when the amount exceeds the maximum", () => {
      expect(() => validatePaymentRecordCurrency({ amount: 100_000_001 })).toThrow(
        "exceeds maximum",
      );
    });

    it("throws when refund exceeds payment", () => {
      expect(() =>
        validatePaymentRecordCurrency({ amount: 1000, refund_amount: 1001 }),
      ).toThrow("exceeds payment");
    });
  });

  describe("validateServiceRecordCurrency", () => {
    it("accepts a well-formed dollar record", () => {
      expect(() => validateServiceRecordCurrency({ total_cost: 250 })).not.toThrow();
    });

    it("throws when the service cost exceeds the maximum", () => {
      expect(() => validateServiceRecordCurrency({ total_cost: 1_000_001 })).toThrow(
        "exceeds maximum",
      );
    });

    it("warns when labor + parts exceed the total", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      validateServiceRecordCurrency({ total_cost: 100, labor_cost: 80, parts_cost: 30 });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
