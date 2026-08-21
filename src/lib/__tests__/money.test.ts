/**
 * F0 financial guardrail tests — verifies the money module surface and that
 * banker's rounding is the sanctioned conversion mode.
 */
import {
  bankersRound,
  centsToDollars,
  dollarsToCents,
  toDollars,
  assertCents,
  addCents,
  subCents,
  ZERO_CENTS,
  type Cents,
  type Dollars,
} from "@/lib/money";

describe("money guardrails (F0)", () => {
  it("re-exports banker's rounding as the sole money rounding mode", () => {
    expect(bankersRound(2.445, 2)).toBe(2.44);
    expect(bankersRound(2.455, 2)).toBe(2.46);
  });

  it("round-trips dollars ↔ cents through the centralized helpers", () => {
    const d: Dollars = toDollars(125.455);
    const c: Cents = dollarsToCents(d);
    expect(c).toBe(12546);
    expect(centsToDollars(c)).toBe(125.46);
  });

  it("assertCents rejects non-integer cents in dev", () => {
    expect(() => assertCents(12.5, "unit-test")).toThrow(/integer cents/);
  });

  it("addCents/subCents stay non-negative and typed", () => {
    const a = assertCents(1000);
    const b = assertCents(400);
    expect(addCents(a, b)).toBe(1400);
    expect(subCents(b, a)).toBe(0);
    expect(subCents(a, ZERO_CENTS)).toBe(1000);
  });
});
