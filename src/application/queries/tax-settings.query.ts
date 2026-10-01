/** Tax Settings Queries — canonical workspace tax configuration via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";

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
  try {
    const { data } = await apiClient.get<{ data: { tax_rate: number | null; operational_settings: Record<string, unknown> | null } | null }>(
      "/v1/billing/tax-settings",
    );
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
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "workspace_missing") {
      throw new Error("Not authenticated");
    }
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}
