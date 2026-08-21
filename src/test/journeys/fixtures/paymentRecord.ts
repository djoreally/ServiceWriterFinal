export function buildPaymentRecordFixture(overrides: Record<string, any> = {}) {
  return {
    id: "pay-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    appointment_id: "appt-001",
    amount: 95.39,
    currency: "usd",
    status: "succeeded",
    payment_method_type: "card",
    stripe_payment_intent_id: "pi_test_99887766",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
