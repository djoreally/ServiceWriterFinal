/**
 * Coupon Query - Validate and fetch coupon codes for booking.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ValidatedCoupon {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  description: string | null;
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
  const trimmed = code.trim();

  // 1) Try a regular coupon code first
  const { data: coupon } = await supabase
    .from("coupon_codes")
    .select("*")
    .eq("user_id", businessUserId)
    .ilike("code", trimmed)
    .eq("is_active", true)
    .maybeSingle();

  if (coupon) {
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      throw new Error("This coupon has expired");
    }
    if (coupon.valid_from && new Date(coupon.valid_from) > new Date()) {
      throw new Error("This coupon is not yet valid");
    }
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      throw new Error("This coupon has reached its usage limit");
    }
    if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
      throw new Error(`Minimum order amount of ${formatCurrency(coupon.min_order_amount)} required`);
    }
    return {
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type as "percentage" | "fixed",
      discount_value: Number(coupon.discount_value),
      description: coupon.description,
    };
  }

  // 2) Try as a phone-number coupon (if the business enabled it)
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 7) {
    const { data: phoneCoupon } = await supabase.rpc("validate_phone_coupon", {
      _business_user_id: businessUserId,
      _phone: digits,
    });
    const row = Array.isArray(phoneCoupon) ? phoneCoupon[0] : phoneCoupon;
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
        description: row.description || "Loyalty discount",
      };
    }
  }

  throw new Error("Invalid or expired coupon code");
}

