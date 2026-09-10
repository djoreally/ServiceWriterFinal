import { supabase } from "@/integrations/supabase/client";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function serializeRules(rules: DetailingPricingRule[]) {
  return rules.map((rule) => ({
    service_catalog_id: rule.serviceCatalogId,
    size_tier: rule.sizeTier,
    condition: rule.condition,
    price_multiplier: rule.priceMultiplier,
    duration_multiplier: rule.durationMultiplier,
    flat_fee: rule.flatFee,
    photo_required: rule.photoRequired,
    quote_required: rule.quoteRequired,
    requires_water: rule.requiresWater,
    requires_power: rule.requiresPower,
    requires_covered_area: rule.requiresCoveredArea,
  }));
}

export async function saveDetailingPricingRules(rules: DetailingPricingRule[]) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving detailing pricing.");
  const { error } = await supabase.rpc("replace_detailing_pricing_rules", {
    p_workspace_id: context.workspaceId,
    p_rules: serializeRules(rules),
  });
  if (error) throw error;
}

export async function saveDetailingPricingRulesForService(serviceCatalogId: string | null, rules: DetailingPricingRule[]) {
  if (!serviceCatalogId) throw new Error("Select a detailing service before saving pricing rules.");
  const { error } = await supabase.rpc("replace_detailing_pricing_rules_for_service", {
    p_service_catalog_id: serviceCatalogId,
    p_rules: serializeRules(rules).map(({ service_catalog_id: _serviceCatalogId, ...rule }) => rule),
  });
  if (error) throw error;
}
