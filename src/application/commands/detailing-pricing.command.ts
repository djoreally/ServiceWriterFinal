/**
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the work-orders Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function serializeRules(rules: DetailingPricingRule[]) {
  return rules.map((rule) => ({
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
  await apiClient.post("/v1/detailing-pricing/rules", {
    workspace_id: context.workspaceId,
    rules: rules.map((rule) => ({ service_catalog_id: rule.serviceCatalogId, ...serializeRules([rule])[0] })),
  });
}

export async function saveDetailingPricingRulesForService(serviceCatalogId: string | null, rules: DetailingPricingRule[]) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving detailing pricing.");
  await apiClient.post("/v1/detailing-pricing/rules-for-service", {
    workspace_id: context.workspaceId,
    service_catalog_id: serviceCatalogId,
    rules: serializeRules(rules),
  });
}
