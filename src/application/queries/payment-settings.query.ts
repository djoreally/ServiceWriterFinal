/** Payment Settings Query — canonical workspace-backed configuration. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveOilPricePerQuart } from "@/lib/oilPricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

const db = productionSupabase as any;

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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function fetchPaymentSettings(): Promise<{ settings: PaymentSettingsData; coupons: CouponCode[] }> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  const [settingsRes, couponsRes] = await Promise.all([
    db.from("workspace_settings")
      .select("tax_rate,oil_price_per_quart,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,operational_settings")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
    db.from("coupon_codes")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (couponsRes.error) throw couponsRes.error;

  const row = settingsRes.data ?? {};
  const operational = object(row.operational_settings);
  const settings: PaymentSettingsData = {
    accept_deposits: Boolean(operational.accept_deposits),
    deposit_percentage: Number(operational.deposit_percentage ?? 20),
    tax_rate: Number(row.tax_rate ?? 0),
    oil_price_per_quart: resolveOilPricePerQuart(row.oil_price_per_quart),
    surcharge_enabled: Boolean(row.surcharge_enabled),
    surcharge_type: row.surcharge_type === "fixed" ? "fixed" : "percentage",
    surcharge_value: Number(row.surcharge_value ?? 3),
    surcharge_description: String(row.surcharge_description || "Card Processing Fee"),
    waste_oil_fee_enabled: Boolean(row.waste_oil_fee_enabled),
    waste_oil_fee: Number(row.waste_oil_fee ?? 0),
    shop_fee_enabled: Boolean(row.shop_fee_enabled),
    shop_fee_type: row.shop_fee_type === "percentage" ? "percentage" : "fixed",
    shop_fee_value: Number(row.shop_fee_value ?? 0),
    shop_fee_description: String(row.shop_fee_description || "Shop Supplies Fee"),
    phone_as_coupon_enabled: Boolean(operational.phone_as_coupon_enabled),
    phone_coupon_discount_type: operational.phone_coupon_discount_type === "fixed" ? "fixed" : "percentage",
    phone_coupon_discount_value: Number(operational.phone_coupon_discount_value ?? 10),
    phone_coupon_min_order_amount: Number(operational.phone_coupon_min_order_amount ?? 0),
    phone_coupon_description: String(operational.phone_coupon_description || "Loyalty discount"),
  };

  return { settings, coupons: (couponsRes.data ?? []) as CouponCode[] };
}
