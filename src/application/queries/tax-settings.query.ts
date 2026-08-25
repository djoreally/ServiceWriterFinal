/** Tax Settings Queries — canonical workspace tax configuration. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface TaxRate {
  id: string;
  state_code: string;
  county: string | null;
  city: string | null;
  postal_code: string | null;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  combined_rate: number;
  is_active: boolean;
}

export interface TaxSettingsData {
  location_tax_enabled: boolean;
  tax_provider: string;
  default_tax_nexus_state: string | null;
  flat_tax_rate: number;
}

export async function fetchTaxSettings(): Promise<{ settings: TaxSettingsData; rates: TaxRate[] }> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Not authenticated");

  const { data, error } = await (supabase as any)
    .from("workspace_settings")
    .select("tax_rate, operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) throw error;

  const operational = data?.operational_settings && typeof data.operational_settings === "object"
    ? data.operational_settings as Record<string, any>
    : {};

  const settings: TaxSettingsData = {
    location_tax_enabled: Boolean(operational.location_tax_enabled),
    tax_provider: typeof operational.tax_provider === "string" ? operational.tax_provider : "manual",
    default_tax_nexus_state: typeof operational.default_tax_nexus_state === "string"
      ? operational.default_tax_nexus_state
      : null,
    flat_tax_rate: Number(data?.tax_rate ?? 0),
  };

  // Final currently uses a canonical flat/workspace tax configuration. Legacy
  // per-location tax_rates are intentionally not queried until that model is
  // reintroduced as a first-class Final table.
  return { settings, rates: [] };
}
