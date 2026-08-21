/**
 * Phone Coupons Commands — upsert and delete per-customer override rows.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface PhoneCouponOverrideInput {
  disabled?: boolean;
  custom_discount_type?: "percentage" | "fixed" | null;
  custom_discount_value?: number | null;
  custom_min_order_amount?: number | null;
  custom_description?: string | null;
  notes?: string | null;
}

export async function upsertPhoneCouponOverride(
  customerId: string,
  payload: PhoneCouponOverrideInput,
): Promise<void> {
  const { data: auth } = await getCurrentAuthUser();
  if (!auth.user) throw new Error("Not authenticated");
  const row = {
    user_id: auth.user.id,
    customer_id: customerId,
    disabled: payload.disabled ?? false,
    custom_discount_type: payload.custom_discount_type ?? null,
    custom_discount_value: payload.custom_discount_value ?? null,
    custom_min_order_amount: payload.custom_min_order_amount ?? null,
    custom_description: payload.custom_description ?? null,
    notes: payload.notes ?? null,
  };
  const { error } = await supabase
    .from("phone_coupon_overrides")
    .upsert(row, { onConflict: "user_id,customer_id" });
  if (error) throw error;
}

export async function deletePhoneCouponOverride(overrideId: string): Promise<void> {
  const { error } = await supabase
    .from("phone_coupon_overrides")
    .delete()
    .eq("id", overrideId);
  if (error) throw error;
}
