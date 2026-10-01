/** Phone Coupons Commands — workspace-scoped override writes via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface PhoneCouponOverrideInput {
  disabled?: boolean;
  custom_discount_type?: "percentage" | "fixed" | null;
  custom_discount_value?: number | null;
  custom_min_order_amount?: number | null;
  custom_description?: string | null;
  notes?: string | null;
}

function toError(error: unknown): Error {
  if (error instanceof ApiClientError && error.status === 401) return new Error("Not authenticated");
  return new Error(error instanceof ApiClientError ? error.message : "Phone coupon request failed");
}

export async function upsertPhoneCouponOverride(customerId: string, payload: PhoneCouponOverrideInput): Promise<void> {
  try {
    await apiClient.post("/v1/billing/phone-coupons/overrides", {
      customer_id: customerId,
      ...payload,
    });
  } catch (error) {
    throw toError(error);
  }
}

export async function deletePhoneCouponOverride(overrideId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/billing/phone-coupons/overrides/${overrideId}`);
  } catch (error) {
    throw toError(error);
  }
}
