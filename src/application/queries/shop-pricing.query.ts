/** Shop pricing defaults for the active workspace. */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SHOP_PRICING, type ShopPricingDefaults } from "@/domain/pricing/repair-estimate";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function fetchShopPricingDefaults(_userId?: string): Promise<ShopPricingDefaults> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { ...DEFAULT_SHOP_PRICING };

  const { data, error } = await (supabase as any)
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_SHOP_PRICING };

  const operational = data.operational_settings && typeof data.operational_settings === "object"
    ? data.operational_settings as Record<string, any>
    : {};

  return {
    laborRate: Number(operational.default_labor_rate) > 0
      ? Number(operational.default_labor_rate)
      : DEFAULT_SHOP_PRICING.laborRate,
    partsMarkupPercent: Number(operational.parts_markup_percent ?? DEFAULT_SHOP_PRICING.partsMarkupPercent),
    shopSuppliesPercent: Number(operational.shop_supplies_percent ?? DEFAULT_SHOP_PRICING.shopSuppliesPercent),
    minLaborHours: Number(operational.min_labor_hours ?? DEFAULT_SHOP_PRICING.minLaborHours),
  };
}

export async function saveShopPricingDefaults(_userId: string, values: ShopPricingDefaults) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("Not authenticated") };

  const client = supabase as any;
  const { data, error } = await client.from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) return { data: null, error };

  const operational = data?.operational_settings && typeof data.operational_settings === "object"
    ? data.operational_settings as Record<string, any>
    : {};

  return client.from("workspace_settings")
    .update({
      operational_settings: {
        ...operational,
        default_labor_rate: values.laborRate,
        parts_markup_percent: values.partsMarkupPercent,
        shop_supplies_percent: values.shopSuppliesPercent,
        min_labor_hours: values.minLaborHours,
      },
    })
    .eq("workspace_id", context.workspaceId);
}
