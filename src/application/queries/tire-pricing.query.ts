import { supabase } from "@/integrations/supabase/client";
import type { TireServicePricingRule } from "@/lib/tire-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

interface TirePricingRow {
  service_catalog_id: string;
  base_installation_price?: number | null;
  mount_balance_price?: number | null;
  tpms_service_price?: number | null;
  disposal_price?: number | null;
  alignment_price?: number | null;
  minimum_quantity?: number | null;
  maximum_quantity?: number | null;
  requires_inventory_selection?: boolean | null;
  requires_fitment_lookup?: boolean | null;
  allows_manual_fitment?: boolean | null;
  allows_staggered_fitment?: boolean | null;
  duration_minutes_per_tire?: number | null;
}

function mapRule(row: TirePricingRow): TireServicePricingRule {
  return {
    serviceCatalogId: row.service_catalog_id,
    baseInstallationPrice: Number(row.base_installation_price || 0),
    mountBalancePrice: Number(row.mount_balance_price || 0),
    tpmsServicePrice: Number(row.tpms_service_price || 0),
    disposalPrice: Number(row.disposal_price || 0),
    alignmentPrice: Number(row.alignment_price || 0),
    minimumQuantity: Number(row.minimum_quantity || 1),
    maximumQuantity: Number(row.maximum_quantity || 4),
    requiresInventorySelection: Boolean(row.requires_inventory_selection),
    requiresFitmentLookup: row.requires_fitment_lookup !== false,
    allowsManualFitment: row.allows_manual_fitment !== false,
    allowsStaggeredFitment: Boolean(row.allows_staggered_fitment),
    durationMinutesPerTire: Number(row.duration_minutes_per_tire || 30),
  };
}

export async function fetchTireServicePricingRules(): Promise<TireServicePricingRule[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before viewing tire pricing.");
  const { data, error } = await supabase
    .from("tire_service_pricing_rules")
    .select("service_catalog_id,base_installation_price,mount_balance_price,tpms_service_price,disposal_price,alignment_price,minimum_quantity,maximum_quantity,requires_inventory_selection,requires_fitment_lookup,allows_manual_fitment,allows_staggered_fitment,duration_minutes_per_tire")
    .eq("workspace_id", context.workspaceId)
    .order("created_at");
  if (error) throw error;
  return (data || []).map((row) => mapRule(row as TirePricingRow));
}
