import { supabase } from "@/integrations/supabase/client";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

type DetailingPricingRow = {
  id?: string;
  service_catalog_id?: string | null;
  size_tier: DetailingPricingRule["sizeTier"];
  condition: DetailingPricingRule["condition"];
  price_multiplier?: number | string | null;
  duration_multiplier?: number | string | null;
  flat_fee?: number | string | null;
  photo_required?: boolean | null;
  quote_required?: boolean | null;
  requires_water?: boolean | null;
  requires_power?: boolean | null;
  requires_covered_area?: boolean | null;
};

function mapRule(row: DetailingPricingRow): DetailingPricingRule {
  return {
    id: row.id,
    serviceCatalogId: row.service_catalog_id ?? null,
    sizeTier: row.size_tier,
    condition: row.condition,
    priceMultiplier: Number(row.price_multiplier ?? 1),
    durationMultiplier: Number(row.duration_multiplier ?? 1),
    flatFee: Number(row.flat_fee ?? 0),
    photoRequired: Boolean(row.photo_required),
    quoteRequired: Boolean(row.quote_required),
    requiresWater: Boolean(row.requires_water),
    requiresPower: Boolean(row.requires_power),
    requiresCoveredArea: Boolean(row.requires_covered_area),
  };
}

export async function fetchPublicDetailingPricingRules(businessUserId: string) {
  const { data, error } = await supabase.rpc("get_public_detailing_pricing_rules", { p_business_user_id: businessUserId });
  if (error) throw error;
  return (data || []).map((row) => mapRule(row as DetailingPricingRow));
}

export async function fetchDetailingPricingRules() {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before viewing detailing pricing.");
  const { data, error } = await supabase
    .from("detailing_pricing_rules")
    .select("id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area")
    .eq("workspace_id", context.workspaceId)
    .order("service_catalog_id")
    .order("size_tier")
    .order("condition");
  if (error) throw error;
  return (data || []).map((row) => mapRule(row as DetailingPricingRow));
}
