/**
 * Payment Settings Query — Read-only data access for payment configuration.
 * All write operations have been moved to payment-settings.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveOilPricePerQuart } from "@/lib/oilPricing";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface PaymentSettingsData {
  accept_deposits: boolean;
  deposit_percentage: number;
  tax_rate: number;
  oil_price_per_quart: number;
  surcharge_enabled: boolean;
  surcharge_type: "percentage" | "fixed";
  surcharge_value: number;
  surcharge_description: string;
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee_type: "percentage" | "fixed";
  shop_fee_value: number;
  shop_fee_description: string;
  phone_as_coupon_enabled: boolean;
  phone_coupon_discount_type: "percentage" | "fixed";
  phone_coupon_discount_value: number;
  phone_coupon_min_order_amount: number;
  phone_coupon_description: string;
}

export interface CouponCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

export async function fetchPaymentSettings(): Promise<{ settings: PaymentSettingsData; coupons: CouponCode[] }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const [profileRes, couponsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("accept_deposits, deposit_percentage, tax_rate, oil_price_per_quart, surcharge_enabled, surcharge_type, surcharge_value, surcharge_description, waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, shop_fee_description, phone_as_coupon_enabled, phone_coupon_discount_type, phone_coupon_discount_value, phone_coupon_min_order_amount, phone_coupon_description")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("coupon_codes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const profile = profileRes.data as Record<string, unknown> | null;
  const settings: PaymentSettingsData = {
    accept_deposits: (profile?.accept_deposits as boolean) || false,
    deposit_percentage: (profile?.deposit_percentage as number) || 20,
    tax_rate: Number(profile?.tax_rate) || 0,
    oil_price_per_quart: resolveOilPricePerQuart(profile?.oil_price_per_quart as number | null | undefined),
    surcharge_enabled: (profile?.surcharge_enabled as boolean) || false,
    surcharge_type: ((profile?.surcharge_type as "percentage" | "fixed") || "percentage"),
    surcharge_value: Number(profile?.surcharge_value) || 3.0,
    surcharge_description: (profile?.surcharge_description as string) || "Card Processing Fee",
    waste_oil_fee_enabled: (profile?.waste_oil_fee_enabled as boolean) || false,
    waste_oil_fee: Number(profile?.waste_oil_fee) || 0,
    shop_fee_enabled: (profile?.shop_fee_enabled as boolean) || false,
    shop_fee_type: ((profile?.shop_fee_type as "percentage" | "fixed") || "fixed"),
    shop_fee_value: Number(profile?.shop_fee_value) || 0,
    shop_fee_description: (profile?.shop_fee_description as string) || "Shop Supplies Fee",
    phone_as_coupon_enabled: (profile?.phone_as_coupon_enabled as boolean) || false,
    phone_coupon_discount_type: ((profile?.phone_coupon_discount_type as "percentage" | "fixed") || "percentage"),
    phone_coupon_discount_value: Number(profile?.phone_coupon_discount_value) || 10,
    phone_coupon_min_order_amount: Number(profile?.phone_coupon_min_order_amount) || 0,
    phone_coupon_description: (profile?.phone_coupon_description as string) || "Loyalty discount",
  };

  return { settings, coupons: (couponsRes.data || []) as CouponCode[] };
}

