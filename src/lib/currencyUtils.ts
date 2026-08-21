/**
 * Currency Utilities - Type-Safe Currency Conversions
 * 
 * Purpose: Prevent off-by-100x calculation errors by enforcing type safety
 * Audit Reference: FINANCIAL_FORENSIC_AUDIT_REPORT.md - Critical Issue #2
 * 
 * CRITICAL RULES:
 * - payment_records.amount is stored in CENTS (INTEGER)
 * - services.total_cost is stored in DOLLARS (NUMERIC)  
 * - NEVER mix these units directly!
 * - Always use these helper functions for conversions
 */

/**
 * Branded type for cents (prevents accidental mixing with dollars)
 * Example: const amount: Cents = 50000; // $500.00
 */
export type Cents = number & { readonly __brand: 'Cents' };

/**
 * Branded type for dollars (prevents accidental mixing with cents)
 * Example: const amount: Dollars = 500.00; // $500.00
 */
export type Dollars = number & { readonly __brand: 'Dollars' };

/**
 * Convert dollars to cents (for Stripe/payment_records)
 * @param dollars - Amount in dollars (e.g., 500.00)
 * @returns Amount in cents (e.g., 50000)
 * @example
 * const serviceCost = 125.50; // from services.total_cost
 * const centsForStripe = toCents(serviceCost); // 12550
 */
export function toCents(dollars: number): Cents {
  if (typeof dollars !== 'number' || !isFinite(dollars)) {
    throw new Error(`Invalid dollar amount: ${dollars}`);
  }
  if (dollars < 0) {
    throw new Error(`Negative amounts not allowed: ${dollars}`);
  }
  if (dollars > 10000000) {
    throw new Error(`Amount exceeds maximum: ${dollars}`);
  }
  return Math.round(dollars * 100) as Cents;
}

/**
 * Convert cents to dollars (for display/services)
 * @param cents - Amount in cents (e.g., 50000)
 * @returns Amount in dollars (e.g., 500.00)
 * @example
 * const paymentAmount = 12550; // from payment_records.amount
 * const dollarsForDisplay = toDollars(paymentAmount); // 125.50
 */
export function toDollars(cents: number): Dollars {
  if (typeof cents !== 'number' || !isFinite(cents)) {
    throw new Error(`Invalid cent amount: ${cents}`);
  }
  if (cents < 0) {
    throw new Error(`Negative amounts not allowed: ${cents}`);
  }
  return (cents / 100) as Dollars;
}

/**
 * Safely add payment amount (cents) and service amount (dollars)
 * @param paymentAmountCents - Amount from payment_records.amount
 * @param serviceAmountDollars - Amount from services.total_cost
 * @returns Total in dollars
 * @example
 * const payment = 50000; // $500.00 in cents
 * const service = 250.00; // $250.00 in dollars
 * const total = addPaymentAndService(payment, service); // 750.00
 */
export function addPaymentAndService(
  paymentAmountCents: number,
  serviceAmountDollars: number
): Dollars {
  return (toDollars(paymentAmountCents) + serviceAmountDollars) as Dollars;
}

/**
 * Calculate net revenue from payment records (handles refunds)
 * @param amount - Gross amount in cents
 * @param refundAmount - Refund amount in cents (0 if none)
 * @returns Net amount in cents
 * @example
 * const grossAmount = 50000; // $500.00
 * const refund = 10000; // $100.00 refund
 * const netCents = calculateNetPayment(grossAmount, refund); // 40000 ($400.00)
 */
export function calculateNetPayment(
  amount: number,
  refundAmount: number = 0
): Cents {
  if (refundAmount > amount) {
    throw new Error(`Refund amount (${refundAmount}) exceeds payment amount (${amount})`);
  }
  return (amount - refundAmount) as Cents;
}

/**
 * Aggregate multiple payment amounts (all in cents)
 * @param payments - Array of payment objects with amount in cents
 * @returns Total in dollars
 * @example
 * const payments = [{amount: 50000}, {amount: 25000}];
 * const total = aggregatePayments(payments); // 750.00
 */
export function aggregatePayments(
  payments: Array<{ amount: number; refund_amount?: number }>
): Dollars {
  const totalCents = payments.reduce((sum, p) => {
    return sum + calculateNetPayment(p.amount, p.refund_amount || 0);
  }, 0);
  return toDollars(totalCents);
}

/**
 * Aggregate multiple service costs (all in dollars)
 * @param services - Array of service objects with total_cost in dollars
 * @returns Total in dollars
 * @example
 * const services = [{total_cost: 500.00}, {total_cost: 250.00}];
 * const total = aggregateServices(services); // 750.00
 */
export function aggregateServices(
  services: Array<{ total_cost: number }>
): Dollars {
  return services.reduce((sum, s) => sum + s.total_cost, 0) as Dollars;
}

/**
 * Derive unpaid/outstanding value from billed services and collected payments.
 * Returns zero when collected exceeds billed (e.g., deposits/prepayments).
 */
export function deriveOutstandingFromBilledAndCollected(
  billedServiceRevenueDollars: number,
  collectedNetRevenueDollars: number
): Dollars {
  if (!isFinite(billedServiceRevenueDollars) || !isFinite(collectedNetRevenueDollars)) {
    throw new Error("Outstanding amount inputs must be finite numbers");
  }
  return Math.max(billedServiceRevenueDollars - collectedNetRevenueDollars, 0) as Dollars;
}

// REMOVED: isCents() and formatCurrencyAuto() were deleted in the Financial Integrity Fix.
// These heuristic functions encouraged unsafe unit guessing (any dollar amount >= $1,000
// was misclassified as cents). Always use explicit toCents()/toDollars() instead.

/**
 * Validate payment record amounts are in cents
 * @param paymentRecord - Payment record from database
 * @throws Error if amounts are invalid
 */
export function validatePaymentRecordCurrency(paymentRecord: {
  amount: number;
  refund_amount?: number;
  subtotal?: number;
  tax_amount?: number;
}): void {
  // All amounts should be integers (cents) if properly stored
  if (!Number.isInteger(paymentRecord.amount)) {
    console.warn(
      `⚠️ payment_records.amount should be INTEGER (cents), got: ${paymentRecord.amount}`
    );
  }
  
  // Validate reasonable ranges
  if (paymentRecord.amount > 100000000) {
    throw new Error(`Payment amount exceeds maximum: ${paymentRecord.amount} cents`);
  }
  
  if (paymentRecord.refund_amount && paymentRecord.refund_amount > paymentRecord.amount) {
    throw new Error(
      `Refund (${paymentRecord.refund_amount}) exceeds payment (${paymentRecord.amount})`
    );
  }
}

/**
 * Validate service record amounts are in dollars
 * @param serviceRecord - Service record from database
 * @throws Error if amounts are invalid
 */
export function validateServiceRecordCurrency(serviceRecord: {
  total_cost: number;
  labor_cost?: number;
  parts_cost?: number;
}): void {
  // Service costs should be reasonable dollar amounts (not cents)
  if (serviceRecord.total_cost > 1000000) {
    throw new Error(`Service cost exceeds maximum: $${serviceRecord.total_cost}`);
  }
  
  // If labor + parts > total, something is wrong
  const laborCost = serviceRecord.labor_cost || 0;
  const partsCost = serviceRecord.parts_cost || 0;
  if (laborCost + partsCost > serviceRecord.total_cost + 0.01) {
    console.warn(
      `⚠️ Service cost breakdown exceeds total: ` +
      `labor=$${laborCost} + parts=$${partsCost} > total=$${serviceRecord.total_cost}`
    );
  }
}
