/**
 * Shop pricing defaults — labor rate, parts markup and shop supplies used by
 * the internal Job Pricing tool.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SHOP_PRICING, type ShopPricingDefaults } from "@/domain/pricing/repair-estimate";

export async function fetchShopPricingDefaults(userId: string): Promise<ShopPricingDefaults> {
  const { data, error } = await (supabase.from("business_profiles") as any)
    .select("default_labor_rate, parts_markup_percent, shop_supplies_percent, min_labor_hours")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SHOP_PRICING };

  return {
    laborRate: Number(data.default_labor_rate) > 0 ? Number(data.default_labor_rate) : DEFAULT_SHOP_PRICING.laborRate,
    partsMarkupPercent: Number(data.parts_markup_percent ?? DEFAULT_SHOP_PRICING.partsMarkupPercent),
    shopSuppliesPercent: Number(data.shop_supplies_percent ?? DEFAULT_SHOP_PRICING.shopSuppliesPercent),
    minLaborHours: Number(data.min_labor_hours ?? DEFAULT_SHOP_PRICING.minLaborHours),
  };
}

export async function saveShopPricingDefaults(userId: string, values: ShopPricingDefaults) {
  return (supabase.from("business_profiles") as any)
    .update({
      default_labor_rate: values.laborRate,
      parts_markup_percent: values.partsMarkupPercent,
      shop_supplies_percent: values.shopSuppliesPercent,
      min_labor_hours: values.minLaborHours,
    })
    .eq("user_id", userId);
}
