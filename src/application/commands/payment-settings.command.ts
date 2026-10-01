/** Payment Settings Commands — canonical workspace-backed writes, via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { PaymentSettingsData } from "@/application/queries/payment-settings.query";

function toError(error: unknown, fallback: string): Error {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return new Error("Not authenticated");
    if (error.code === "workspace_missing") return new Error("No active workspace is available.");
    return new Error(error.message);
  }
  return new Error(fallback);
}

export async function savePaymentSettings(settings: PaymentSettingsData): Promise<void> {
  try {
    // The server resolves the workspace from the auth token, merges the
    // operational_settings, and upserts the workspace_settings row.
    await apiClient.put("/v1/billing/payment-settings", settings);
  } catch (error) {
    throw toError(error, "Failed to save payment settings");
  }
}

export async function saveCoupon(couponData: {
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  valid_until: string | null;
}, editingId?: string): Promise<void> {
  try {
    if (editingId) {
      await apiClient.put(`/v1/billing/coupons/${editingId}`, couponData);
    } else {
      await apiClient.post("/v1/billing/coupons", couponData);
    }
  } catch (error) {
    throw toError(error, "Failed to save coupon");
  }
}

export async function deleteCoupon(couponId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/billing/coupons/${couponId}`);
  } catch (error) {
    throw toError(error, "Failed to delete coupon");
  }
}

export async function toggleCouponActive(couponId: string, isActive: boolean): Promise<void> {
  try {
    await apiClient.patch(`/v1/billing/coupons/${couponId}`, { is_active: isActive });
  } catch (error) {
    throw toError(error, "Failed to update coupon");
  }
}
