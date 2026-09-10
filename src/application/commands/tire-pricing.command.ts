import { supabase } from "@/integrations/supabase/client";
import type { TireServicePricingRule } from "@/lib/tire-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

// Live production schema is ahead of generated Supabase types; isolate the
// compatibility cast here until the generated database types are refreshed.
const db = supabase as any;

export async function saveTireServicePricingRule(rule: TireServicePricingRule) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving tire pricing.");

  const row = {
    workspace_id: context.workspaceId,
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
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("tire_service_pricing_rules")
    .upsert(row, { onConflict: "workspace_id,service_catalog_id" });
  if (error) throw error;
}
