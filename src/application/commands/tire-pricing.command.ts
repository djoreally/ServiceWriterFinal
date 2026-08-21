import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import type { TireServicePricingRule } from "@/lib/tire-pricing";

type TireRuleRow = {
  user_id: string;
  service_catalog_id: string;
  base_installation_price: number;
  mount_balance_price: number;
  tpms_service_price: number;
  disposal_price: number;
  alignment_price: number;
  minimum_quantity: number;
  maximum_quantity: number;
  requires_inventory_selection: boolean;
  requires_fitment_lookup: boolean;
  allows_manual_fitment: boolean;
  allows_staggered_fitment: boolean;
  duration_minutes_per_tire: number;
};

export async function saveTireServicePricingRule(rule: TireServicePricingRule) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const row: TireRuleRow = {
    user_id: user.id,
    service_catalog_id: rule.serviceCatalogId,
    base_installation_price: rule.baseInstallationPrice,
    mount_balance_price: rule.mountBalancePrice,
    tpms_service_price: rule.tpmsServicePrice,
    disposal_price: rule.disposalPrice,
    alignment_price: rule.alignmentPrice,
    minimum_quantity: rule.minimumQuantity,
    maximum_quantity: rule.maximumQuantity,
    requires_inventory_selection: rule.requiresInventorySelection,
    requires_fitment_lookup: rule.requiresFitmentLookup,
    allows_manual_fitment: rule.allowsManualFitment,
    allows_staggered_fitment: rule.allowsStaggeredFitment,
    duration_minutes_per_tire: rule.durationMinutesPerTire,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("tire_service_pricing_rules").upsert(row, { onConflict: "user_id,service_catalog_id" });
  if (error) throw error;
}
