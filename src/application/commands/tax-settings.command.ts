/**
 * Tax Settings Commands — Write operations for tax configuration via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { TaxSettingsData } from "@/application/queries/tax-settings.query";

function toError(error: unknown): Error {
  return new Error(error instanceof ApiClientError ? error.message : "Tax settings request failed");
}

export async function saveTaxSettings(settings: TaxSettingsData): Promise<void> {
  try {
    await apiClient.put("/v1/billing/tax-settings", {
      location_tax_enabled: settings.location_tax_enabled,
      tax_provider: settings.tax_provider,
      default_tax_nexus_state: settings.default_tax_nexus_state,
      flat_tax_rate: settings.flat_tax_rate,
    });
  } catch (error) {
    throw toError(error);
  }
}

export async function seedDefaultTaxRates(): Promise<void> {
  try {
    await apiClient.post("/v1/billing/tax-settings/seed");
  } catch (error) {
    throw toError(error);
  }
}

export async function saveTaxRate(rate: {
  state_code: string;
  county: string | null;
  city: string | null;
  postal_code: string | null;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  combined_rate: number;
}, editingId?: string): Promise<void> {
  try {
    if (editingId) {
      await apiClient.put(`/v1/billing/tax-rates/${editingId}`, rate);
    } else {
      await apiClient.post("/v1/billing/tax-rates", rate);
    }
  } catch (error) {
    throw toError(error);
  }
}

export async function deleteTaxRate(rateId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/billing/tax-rates/${rateId}`);
  } catch (error) {
    throw toError(error);
  }
}
