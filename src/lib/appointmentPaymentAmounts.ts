/**
 * Appointment Payment Amounts — the single computation behind the
 * appointment detail page's "Create Payment Record" action
 * (AppointmentPaymentsTab). Extracted from the tab so the money math is
 * unit-testable; the tab and the closeout dialog
 * (CompleteAppointmentDialog) must agree on these amounts because the
 * server enforces them (see @/server/payments/locked-quote).
 *
 * TAX-RATE CONTRACT: `taxRatePercent` is the workspace `tax_rate` value,
 * which is a PERCENT everywhere it is stored or displayed (6 means 6% —
 * see the zod caps of 100 on tax_rate fields and the `/100` division in
 * the invoice / service-record computations). It is NOT a fraction.
 */
import { dollarsToCents, toDollars } from "@/lib/financialMath";

export interface AppointmentPaymentAmountInput {
  /** True when the appointment's quote is locked (website / booking-link / manual). */
  priceLocked: boolean;
  /** Dollars still to collect on a locked quote (quote − already paid). */
  lockedAmountDue?: number | null;
  /** Dollars: the appointment total as displayed (the locked quote when locked). */
  estimatedTotal: number;
  /** Dollars: tax already recorded on the appointment (0 when none). */
  taxAmount?: number;
  /** Dollars: pre-tax subtotal, when known. */
  subtotal?: number;
  /** Workspace tax_rate — a PERCENT (6 means 6%), never a fraction. */
  taxRatePercent?: number | null;
}

export interface AppointmentPaymentAmounts {
  amountCents: number;
  subtotalCents: number;
  taxCents: number | null;
  taxRate: number | null;
}

export function computeAppointmentPaymentAmounts(
  input: AppointmentPaymentAmountInput,
): AppointmentPaymentAmounts {
  const { estimatedTotal, taxAmount = 0, subtotal, taxRatePercent } = input;

  // Locked quote: the stored quote IS the total. The amount to collect is
  // the remaining locked balance and no tax or fee is ever recomputed on
  // top of it — the server rejects anything else
  // (@/server/payments/locked-quote), and CompleteAppointmentDialog's
  // closeout path already creates the record exactly this way.
  if (input.priceLocked) {
    const dueDollars = input.lockedAmountDue ?? estimatedTotal;
    const dueCents = dollarsToCents(toDollars(Math.max(0, dueDollars)));
    return {
      amountCents: dueCents,
      subtotalCents: dueCents,
      taxCents: null,
      taxRate: null,
    };
  }

  // If no tax was explicitly set on the appointment but a tax rate exists,
  // compute it. taxRatePercent is a PERCENT (6 = 6%), so the tax is
  // subtotal * rate / 100 — multiplying by the raw value was the INV-106
  // bug ($133.83 at "rate 6" produced $802.98 of phantom tax).
  let effectiveTax = taxAmount;
  let effectiveSubtotal = subtotal;
  if (effectiveTax === 0 && taxRatePercent && taxRatePercent > 0 && estimatedTotal > 0) {
    effectiveSubtotal = effectiveSubtotal ?? estimatedTotal;
    effectiveTax = (effectiveSubtotal * taxRatePercent) / 100;
  }
  const taxInCents = dollarsToCents(toDollars(effectiveTax));
  const subtotalInCents = effectiveSubtotal != null
    ? dollarsToCents(toDollars(effectiveSubtotal))
    : (dollarsToCents(toDollars(estimatedTotal)) - taxInCents);
  const amountInCents = subtotalInCents + taxInCents;

  return {
    amountCents: amountInCents,
    subtotalCents: subtotalInCents,
    taxCents: taxInCents > 0 ? taxInCents : null,
    taxRate: taxRatePercent || null,
  };
}
