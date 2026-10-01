/** Shop pricing defaults for the active workspace. */
import { apiClient } from "@/lib/api-client";
import { DEFAULT_SHOP_PRICING, type ShopPricingDefaults } from "@/domain/pricing/repair-estimate";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function toDefaults(operational: Record<string, unknown>): ShopPricingDefaults {
  return {
    laborRate: Number(operational.default_labor_rate) > 0
      ? Number(operational.default_labor_rate)
      : DEFAULT_SHOP_PRICING.laborRate,
    partsMarkupPercent: Number(operational.parts_markup_percent ?? DEFAULT_SHOP_PRICING.partsMarkupPercent),
    shopSuppliesPercent: Number(operational.shop_supplies_percent ?? DEFAULT_SHOP_PRICING.shopSuppliesPercent),
    minLaborHours: Number(operational.min_labor_hours ?? DEFAULT_SHOP_PRICING.minLaborHours),
  };
}

export async function fetchShopPricingDefaults(_userId?: string): Promise<ShopPricingDefaults> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { ...DEFAULT_SHOP_PRICING };
  try {
    const response = await apiClient.get<{ data: Record<string, unknown> }>(
      "/v1/shop-pricing/operational-settings",
      { query: { workspace_id: context.workspaceId } },
    );
    return toDefaults(response.data ?? {});
  } catch {
    return { ...DEFAULT_SHOP_PRICING };
  }
}

export async function saveShopPricingDefaults(_userId: string, values: ShopPricingDefaults) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("Not authenticated") };

  try {
    const current = await apiClient.get<{ data: Record<string, unknown> }>(
      "/v1/shop-pricing/operational-settings",
      { query: { workspace_id: context.workspaceId } },
    );
    const response = await apiClient.put<{ data: { workspace_id: string } }>(
      "/v1/shop-pricing/operational-settings",
      {
        workspace_id: context.workspaceId,
        operational_settings: {
          ...(current.data ?? {}),
          default_labor_rate: values.laborRate,
          parts_markup_percent: values.partsMarkupPercent,
          shop_supplies_percent: values.shopSuppliesPercent,
          min_labor_hours: values.minLaborHours,
        },
      },
    );
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Request failed") };
  }
}
