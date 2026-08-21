import { supabase } from "@/integrations/supabase/client";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };
const rpcClient = supabase as unknown as RpcClient;

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
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const rows = rules.map((rule) => ({ user_id: user.id, service_catalog_id: rule.serviceCatalogId, ...serializeRules([rule])[0] }));
  const { error } = await rpcClient.rpc("replace_detailing_pricing_rules", { p_rules: rows });
  if (error) throw error;
}

export async function saveDetailingPricingRulesForService(serviceCatalogId: string | null, rules: DetailingPricingRule[]) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await rpcClient.rpc("replace_detailing_pricing_rules_for_service", {
    p_service_catalog_id: serviceCatalogId,
    p_rules: serializeRules(rules),
  });
  if (error) throw error;
}
