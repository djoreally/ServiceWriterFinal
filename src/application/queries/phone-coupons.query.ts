/**
 * Phone Coupons Query Layer — reads customer phone list and per-customer
 * override rows used by the `validate_phone_coupon` RPC at booking time.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface PhoneCouponOverride {
  id: string;
  customer_id: string;
  disabled: boolean;
  custom_discount_type: "percentage" | "fixed" | null;
  custom_discount_value: number | null;
  custom_min_order_amount: number | null;
  custom_description: string | null;
  notes: string | null;
}

export interface PhoneCouponCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface PhoneCouponData {
  userId: string;
  customers: PhoneCouponCustomer[];
  overrides: PhoneCouponOverride[];
}

export async function fetchPhoneCouponData(): Promise<PhoneCouponData | null> {
  const { data: auth } = await getCurrentAuthUser();
  if (!auth.user) return null;
  const [{ data: customers, error: cErr }, { data: overrides, error: oErr }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("user_id", auth.user.id)
      .not("phone", "is", null)
      .order("name", { ascending: true }),
    supabase
      .from("phone_coupon_overrides")
      .select("*")
      .eq("user_id", auth.user.id),
  ]);
  if (cErr) throw cErr;
  if (oErr) throw oErr;
  return {
    userId: auth.user.id,
    customers: (customers ?? []) as PhoneCouponCustomer[],
    overrides: (overrides ?? []) as unknown as PhoneCouponOverride[],
  };
}
