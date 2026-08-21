import { calculateFleetInvoiceTotals } from "@/lib/fleetInvoiceTotals";

describe("calculateFleetInvoiceTotals", () => {
  it("adds a percentage processing fee before sales tax", () => {
    expect(calculateFleetInvoiceTotals(100, {
      taxEnabled: true,
      taxRate: 8,
      processingFeeEnabled: true,
      processingFeeType: "percentage",
      processingFeeValue: 3,
    })).toEqual({ processingFee: 3, tax: 8.24, total: 111.24 });
  });

  it("supports a fixed fee and disabled tax", () => {
    expect(calculateFleetInvoiceTotals(75, {
      taxEnabled: false,
      taxRate: 9,
      processingFeeEnabled: true,
      processingFeeType: "fixed",
      processingFeeValue: 2.5,
    })).toEqual({ processingFee: 2.5, tax: 0, total: 77.5 });
  });
});
