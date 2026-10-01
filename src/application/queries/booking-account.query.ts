/**
 * Booking Account Query - Customer email check for the booking flow.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */

import { apiClient } from "@/lib/api-client";

export interface CustomerEmailCheckResult {
  has_account: boolean;
  customer_name: string | null;
}

/** Check if a customer account exists for the given email. */
export async function checkCustomerEmail(email: string): Promise<CustomerEmailCheckResult | null> {
  const response = await apiClient.post<{ data: CustomerEmailCheckResult[] | null; error: unknown }>(
    "/v1/appointments/booking-rpc",
    { fn: "check_customer_email", params: { p_email: email.trim() } },
  );

  if (response.error) {
    console.error("Error checking email:", response.error);
    return null;
  }

  const result = response.data?.[0];
  return result ?? null;
}
