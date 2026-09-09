export const ANNUAL_DISCOUNT_RATE = 0.20 as const;

export const SERVICE_WRITER_PRICING = {
  basic: {
    key: "basic",
    name: "Basic",
    monthlyPrice: 0,
    annualPrice: 0,
    includedTechnicians: 0,
    additionalTechnicianMonthly: null,
    additionalTechnicianAnnual: null,
  },
  pro: {
    key: "pro",
    name: "Pro",
    monthlyPrice: 99,
    annualPrice: 950.40,
    includedTechnicians: 3,
    additionalTechnicianMonthly: 9.99,
    additionalTechnicianAnnual: 95.90,
  },
  fleet: {
    key: "fleet",
    name: "Fleet",
    monthlyPrice: 299,
    annualPrice: 2870.40,
    includedTechnicians: 5,
    additionalTechnicianMonthly: 7.99,
    additionalTechnicianAnnual: 76.70,
  },
  payments: {
    key: "payments",
    name: "Payments",
    monthlyPrice: 99,
    annualPrice: 950.40,
    serviceWriterTransactionFeeRate: 0,
  },
} as const;

export type CanonicalBasePlan = "basic" | "pro" | "fleet";

/**
 * Commercial invariant: public pricing, Stripe SaaS checkout, entitlements,
 * invoices, and internal billing UI must derive from this contract.
 *
 * Do not introduce alternate public plan names, percentage transaction fees,
 * or different amounts without an explicit pricing decision.
 */
export function annualPriceFromMonthly(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT_RATE) * 100) / 100;
}
