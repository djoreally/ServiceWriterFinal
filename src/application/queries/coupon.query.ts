/**
 * Coupon Query - Validate and fetch coupon codes for booking, via the
 * public Hono billing API. Friendly validation messages stay client-side.
 */

import { apiClient, ApiClientError } from "@/lib/api-client";

export interface ValidatedCoupon {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  description: string | null;
}

interface ValidateCouponResponse {
  kind: "coupon" | "phone_coupon" | "none";
  row?: Record<string, unknown>;
  digits?: string;
}

/**
 * Validate a coupon code for a given business user and subtotal.
 * Returns the validated coupon or throws an error with a user-friendly message.
 */
export async function validateCouponCode(
  businessUserId: string,
  code: string,
  subtotal: number,
  formatCurrency: (amount: number) => string,
): Promise<ValidatedCoupon> {
  let data: ValidateCouponResponse;
  try {
    data = await apiClient.post<ValidateCouponResponse>("/v1/billing/coupons/validate", {
      business_user_id: businessUserId,
      code,
    });
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }

  // 1) Try a regular coupon code first
  const coupon = data.kind === "coupon" ? data.row : undefined;
  if (coupon) {
    const validUntil = coupon.valid_until as string | null | undefined;
    const validFrom = coupon.valid_from as string | null | undefined;
    const maxUses = coupon.max_uses as number | null | undefined;
    const usedCount = Number(coupon.used_count ?? 0);
    const minOrderAmount = Number(coupon.min_order_amount ?? 0);
    if (validUntil && new Date(validUntil) < new Date()) {
      throw new Error("This coupon has expired");
    }
    if (validFrom && new Date(validFrom) > new Date()) {
      throw new Error("This coupon is not yet valid");
    }
    if (maxUses && usedCount >= maxUses) {
      throw new Error("This coupon has reached its usage limit");
    }
    if (minOrderAmount && subtotal < minOrderAmount) {
      throw new Error(`Minimum order amount of ${formatCurrency(minOrderAmount)} required`);
    }
    return {
      id: String(coupon.id),
      code: String(coupon.code),
      discount_type: coupon.discount_type as "percentage" | "fixed",
      discount_value: Number(coupon.discount_value),
      description: (coupon.description as string | null) ?? null,
    };
  }

  // 2) Try as a phone-number coupon (if the business enabled it)
  const row = data.kind === "phone_coupon" ? data.row : undefined;
  const digits = data.digits ?? "";
  if (row) {
    const min = Number(row.min_order_amount) || 0;
    if (min && subtotal < min) {
      throw new Error(`Minimum order amount of ${formatCurrency(min)} required`);
    }
    return {
      id: `phone:${digits}`,
      code: digits,
      discount_type: (row.discount_type as "percentage" | "fixed") || "percentage",
      discount_value: Number(row.discount_value) || 0,
      description: (row.description as string) || "Loyalty discount",
    };
  }

  throw new Error("Invalid or expired coupon code");
}
