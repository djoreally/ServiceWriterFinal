import { describe, expect, it } from "vitest";
import { ANNUAL_DISCOUNT_RATE, SERVICE_WRITER_PRICING, annualPriceFromMonthly } from "./canonical-pricing";

describe("canonical Service Writer pricing", () => {
  it("locks the public base plan prices", () => {
    expect(SERVICE_WRITER_PRICING.basic.monthlyPrice).toBe(0);
    expect(SERVICE_WRITER_PRICING.pro.monthlyPrice).toBe(99);
    expect(SERVICE_WRITER_PRICING.fleet.monthlyPrice).toBe(299);
  });

  it("locks technician inclusions and overage pricing", () => {
    expect(SERVICE_WRITER_PRICING.pro.includedTechnicians).toBe(3);
    expect(SERVICE_WRITER_PRICING.pro.additionalTechnicianMonthly).toBe(9.99);
    expect(SERVICE_WRITER_PRICING.fleet.includedTechnicians).toBe(5);
    expect(SERVICE_WRITER_PRICING.fleet.additionalTechnicianMonthly).toBe(7.99);
  });

  it("locks Payments as a flat add-on with zero Service Writer transaction fee", () => {
    expect(SERVICE_WRITER_PRICING.payments.monthlyPrice).toBe(99);
    expect(SERVICE_WRITER_PRICING.payments.serviceWriterTransactionFeeRate).toBe(0);
  });

  it("uses the canonical 20 percent annual discount", () => {
    expect(ANNUAL_DISCOUNT_RATE).toBe(0.2);
    expect(annualPriceFromMonthly(99)).toBe(950.4);
    expect(annualPriceFromMonthly(299)).toBe(2870.4);
    expect(annualPriceFromMonthly(9.99)).toBe(95.9);
    expect(annualPriceFromMonthly(7.99)).toBe(76.7);
  });
});
