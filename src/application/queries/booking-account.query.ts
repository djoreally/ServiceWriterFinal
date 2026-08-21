/**
 * Booking Account Query - Customer email check for the booking flow.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CustomerEmailCheckResult {
  has_account: boolean;
  customer_name: string | null;
}

/** Check if a customer account exists for the given email. */
export async function checkCustomerEmail(email: string): Promise<CustomerEmailCheckResult | null> {
  const { data, error } = await supabase.rpc("check_customer_email", {
    p_email: email.trim(),
  });

  if (error) {
    console.error("Error checking email:", error);
    return null;
  }

  const result = data?.[0];
  return result ?? null;
}
