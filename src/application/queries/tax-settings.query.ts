/**
 * Tax Settings Queries — Read operations for tax rates and business tax config.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

async function getUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function fetchTaxSettings(): Promise<{ settings: TaxSettingsData; rates: TaxRate[] }> {
  const userId = await getUserId();

  const [profileRes, ratesRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("location_tax_enabled, tax_provider, default_tax_nexus_state, tax_rate")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("tax_rates")
      .select("*")
      .eq("user_id", userId)
      .order("state_code", { ascending: true }),
  ]);

  const profile = profileRes.data;
  const settings: TaxSettingsData = {
    location_tax_enabled: profile?.location_tax_enabled ?? false,
    tax_provider: profile?.tax_provider ?? "manual",
    default_tax_nexus_state: profile?.default_tax_nexus_state ?? null,
    flat_tax_rate: Number(profile?.tax_rate ?? 0),
  };

  return { settings, rates: ratesRes.data || [] };
}
