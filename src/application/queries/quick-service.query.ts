/**
 * Quick Service Query — Read operations for the QuickService wizard page.
 */
import { supabase } from "@/integrations/supabase/client";
import { getWorkspaceOwnerUserId } from "@/application/tenant-workspace";

/** Get the current authenticated user ID. */
export async function getCurrentUserId(): Promise<string | null> {
  return getWorkspaceOwnerUserId();
}

/** Fetch existing customers, vehicles, and active service catalog for the current user. */
export async function fetchQuickServiceFormData() {
  const [customersRes, vehiclesRes, catalogRes] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("vehicles").select("id, customer_id, make, model, year"),
    supabase.from("service_catalog").select("id, name, description, default_price, labor_rate").eq("is_active", true).order("name"),
  ]);
  return {
    customers: customersRes.data || [],
    vehicles: vehiclesRes.data || [],
    catalog: catalogRes.data || [],
  };
}
