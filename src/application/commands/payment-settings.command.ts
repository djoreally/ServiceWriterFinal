/**
 * Payment Settings Commands — All write operations for payment configuration.
 * Extracted from payment-settings.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PaymentSettingsData } from "@/application/queries/payment-settings.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function getUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function savePaymentSettings(settings: PaymentSettingsData): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase
    .from("business_profiles")
    .update({
      accept_deposits: settings.accept_deposits,
      deposit_percentage: settings.deposit_percentage,
      tax_rate: settings.tax_rate,
      oil_price_per_quart: settings.oil_price_per_quart,
      surcharge_enabled: settings.surcharge_enabled,
      surcharge_type: settings.surcharge_type,
      surcharge_value: settings.surcharge_value,
      surcharge_description: settings.surcharge_description,
      waste_oil_fee_enabled: settings.waste_oil_fee_enabled,
      waste_oil_fee: settings.waste_oil_fee,
      shop_fee_enabled: settings.shop_fee_enabled,
      shop_fee_type: settings.shop_fee_type,
      shop_fee_value: settings.shop_fee_value,
      shop_fee_description: settings.shop_fee_description,
      phone_as_coupon_enabled: settings.phone_as_coupon_enabled,
      phone_coupon_discount_type: settings.phone_coupon_discount_type,
      phone_coupon_discount_value: settings.phone_coupon_discount_value,
      phone_coupon_min_order_amount: settings.phone_coupon_min_order_amount,
      phone_coupon_description: settings.phone_coupon_description,
    })
    .eq("user_id", userId);
  if (error) throw error;
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
  const userId = await getUserId();
  const payload = { ...couponData, user_id: userId };

  if (editingId) {
    const { error } = await supabase.from("coupon_codes").update(payload).eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("coupon_codes").insert(payload);
    if (error) throw error;
  }
}

export async function deleteCoupon(couponId: string): Promise<void> {
  const { error } = await supabase.from("coupon_codes").delete().eq("id", couponId);
  if (error) throw error;
}

export async function toggleCouponActive(couponId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("coupon_codes").update({ is_active: isActive }).eq("id", couponId);
  if (error) throw error;
}
