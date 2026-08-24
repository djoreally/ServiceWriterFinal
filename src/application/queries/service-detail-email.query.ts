/** Service detail optional integrations. */

/**
 * Final main currently has no email provider runtime. Keep the incomplete UI
 * explicitly unavailable instead of invoking the retired Lovable send-email
 * Edge Function.
 */
export async function emailServiceRecord(_body: Record<string, unknown>): Promise<void> {
  throw new Error("Service-record email is not configured on Final yet.");
}

/**
 * Legacy inspection storage has not been converged into Final. The inspection
 * UI is feature-gated, so return an empty collection rather than querying a
 * table that is not part of the canonical Service Writer contract.
 */
export async function fetchServiceInspections(_serviceId: string) {
  return [];
}
