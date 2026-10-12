import { calculatePublicBookingFinancials } from "@/domain/financials/public-booking-financials";

const momsFees = {
  waste_oil_fee_enabled: true,
  waste_oil_fee: 4,
  shop_fee_enabled: false,
  shop_fee_type: "fixed",
  shop_fee_value: 0,
  surcharge_enabled: true,
  surcharge_type: "percentage",
  surcharge_value: 3,
};

describe("calculatePublicBookingFinancials", () => {
  it("does not charge the card surcharge for pay-at-service", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 120,
      hasOilService: true,
      feeSettings: momsFees,
      paymentMode: "pay_at_service",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    });

    expect(result).toMatchObject({
      calculationVersion: "public_booking_financial_v1",
      priceSource: "canonical_appointment_items",
      paymentMode: "pay_at_service",
      itemSubtotalCents: 12000,
      discountCents: 0,
      wasteOilFeeCents: 400,
      shopFeeCents: 0,
      surchargeCents: 0,
      taxableBaseCents: 12400,
      taxCents: 744,
      totalCents: 13144,
      taxRatePercent: 6,
      taxSource: "workspace_manual_rate",
    });
  });

  it("charges the configured card surcharge only for online card payment", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 120,
      hasOilService: true,
      feeSettings: momsFees,
      paymentMode: "online_card",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    });

    expect(result.surchargeCents).toBe(372);
    expect(result.taxableBaseCents).toBe(12772);
    expect(result.taxCents).toBe(766);
    expect(result.totalCents).toBe(13538);
  });

  it("applies discount before fees and tax", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 120,
      discountDollars: 10,
      hasOilService: true,
      feeSettings: momsFees,
      paymentMode: "online_card",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    });

    expect(result.discountCents).toBe(1000);
    expect(result.afterDiscountCents).toBe(11000);
    expect(result.wasteOilFeeCents).toBe(400);
    expect(result.surchargeCents).toBe(342);
    expect(result.taxableBaseCents).toBe(11742);
    expect(result.taxCents).toBe(705);
    expect(result.totalCents).toBe(12447);
  });

  it("never applies waste-oil disposal to a non-oil booking", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 120,
      hasOilService: false,
      feeSettings: momsFees,
      paymentMode: "pay_at_service",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    });

    expect(result.wasteOilFeeCents).toBe(0);
    expect(result.taxableBaseCents).toBe(12000);
    expect(result.taxCents).toBe(720);
    expect(result.totalCents).toBe(12720);
  });

  it("uses exact provider tax cents without recomputing a manual rate", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 100,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: {
        amountCents: 877,
        ratePercent: 6,
        source: "stripe_tax_connect",
        calculationId: "taxcalc_test",
      },
    });

    expect(result.taxableBaseCents).toBe(10000);
    expect(result.taxCents).toBe(877);
    expect(result.totalCents).toBe(10877);
    expect(result.taxRatePercent).toBeNull();
    expect(result.taxCalculationId).toBe("taxcalc_test");
  });

  it("respects an authoritative zero-tax provider result", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 100,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: {
        amountCents: 0,
        ratePercent: 6,
        source: "stripe_tax_connect",
      },
    });

    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(10000);
    expect(result.taxRatePercent).toBeNull();
  });

  it("caps a discount at the item subtotal", () => {
    const result = calculatePublicBookingFinancials({
      itemSubtotalDollars: 25,
      discountDollars: 100,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    });

    expect(result.discountCents).toBe(2500);
    expect(result.afterDiscountCents).toBe(0);
    expect(result.taxableBaseCents).toBe(0);
    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it("rejects malformed money and tax inputs", () => {
    expect(() => calculatePublicBookingFinancials({
      itemSubtotalDollars: -1,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: { ratePercent: 6, source: "workspace_manual_rate" },
    })).toThrow("itemSubtotalDollars");

    expect(() => calculatePublicBookingFinancials({
      itemSubtotalDollars: 10,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: { amountCents: 1.5, source: "stripe_tax_connect" },
    })).toThrow("tax.amountCents must be an integer");

    expect(() => calculatePublicBookingFinancials({
      itemSubtotalDollars: 10,
      hasOilService: false,
      paymentMode: "pay_at_service",
      tax: { ratePercent: 101, source: "workspace_manual_rate" },
    })).toThrow("tax.ratePercent");
  });
});
