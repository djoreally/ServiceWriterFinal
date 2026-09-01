/** Payment Settings Commands — canonical workspace-backed writes. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { PaymentSettingsData } from "@/application/queries/payment-settings.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const db = productionSupabase as any;

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function savePaymentSettings(settings: PaymentSettingsData): Promise<void> {
  const { workspaceId } = await requireContext();
  const current = await db.from("workspace_settings").select("operational_settings").eq("workspace_id", workspaceId).maybeSingle();
  if (current.error) throw current.error;
  const operational = {
    ...object(current.data?.operational_settings),
    accept_deposits: settings.accept_deposits,
    deposit_percentage: settings.deposit_percentage,
    phone_as_coupon_enabled: settings.phone_as_coupon_enabled,
    phone_coupon_discount_type: settings.phone_coupon_discount_type,
    phone_coupon_discount_value: settings.phone_coupon_discount_value,
    phone_coupon_min_order_amount: settings.phone_coupon_min_order_amount,
    phone_coupon_description: settings.phone_coupon_description,
  };
  const { error } = await db.from("workspace_settings").upsert({
    workspace_id: workspaceId,
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
    operational_settings: operational,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
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
  const { userId, workspaceId } = await requireContext();
  const payload = { ...couponData, workspace_id: workspaceId, user_id: userId };
  if (editingId) {
    const { error } = await db.from("coupon_codes").update(payload).eq("workspace_id", workspaceId).eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await db.from("coupon_codes").insert(payload);
    if (error) throw error;
  }
}

export async function deleteCoupon(couponId: string): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("coupon_codes").delete().eq("workspace_id", workspaceId).eq("id", couponId);
  if (error) throw error;
}

export async function toggleCouponActive(couponId: string, isActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("coupon_codes").update({ is_active: isActive }).eq("workspace_id", workspaceId).eq("id", couponId);
  if (error) throw error;
}
