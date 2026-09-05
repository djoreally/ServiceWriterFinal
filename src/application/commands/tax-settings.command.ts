/** Tax Settings Commands — canonical workspace tax configuration. */
import { supabase } from "@/integrations/supabase/client";
import type { TaxSettingsData } from "@/application/queries/tax-settings.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function saveTaxSettings(settings: TaxSettingsData): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Not authenticated");

  const { data: current, error: readError } = await (supabase as any)
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) throw readError;

  const operational = {
    ...object(current?.operational_settings),
    location_tax_enabled: settings.location_tax_enabled,
    tax_provider: settings.tax_provider,
    default_tax_nexus_state: settings.default_tax_nexus_state,
  };

  const { error } = await (supabase as any)
    .from("workspace_settings")
    .update({
      tax_rate: settings.flat_tax_rate,
      operational_settings: operational,
    })
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;
}

const LOCATION_TAX_RETIRED = "Per-location tax-rate management is not enabled in the canonical Service Writer schema";

export async function seedDefaultTaxRates(): Promise<void> {
  throw new Error(LOCATION_TAX_RETIRED);
}

export async function saveTaxRate(_rate: {
  state_code: string;
  county: string | null;
  city: string | null;
  postal_code: string | null;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  combined_rate: number;
}, _editingId?: string): Promise<void> {
  throw new Error(LOCATION_TAX_RETIRED);
}

export async function deleteTaxRate(_rateId: string): Promise<void> {
  throw new Error(LOCATION_TAX_RETIRED);
}
