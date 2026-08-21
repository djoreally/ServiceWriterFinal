/**
 * Tax Settings Commands — Write operations for tax configuration.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TaxSettingsData } from "@/application/queries/tax-settings.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function getUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function saveTaxSettings(settings: TaxSettingsData): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase
    .from("business_profiles")
    .update({
      location_tax_enabled: settings.location_tax_enabled,
      tax_provider: settings.tax_provider,
      default_tax_nexus_state: settings.default_tax_nexus_state,
      tax_rate: settings.flat_tax_rate,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function seedDefaultTaxRates(): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.rpc("seed_default_tax_rates", { p_user_id: userId });
  if (error) throw error;
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
  const userId = await getUserId();
  const rateData = { ...rate, user_id: userId, is_active: true };

  if (editingId) {
    const { error } = await supabase.from("tax_rates").update(rateData).eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("tax_rates").insert(rateData);
    if (error) throw error;
  }
}

export async function deleteTaxRate(rateId: string): Promise<void> {
  const { error } = await supabase.from("tax_rates").delete().eq("id", rateId);
  if (error) throw error;
}
