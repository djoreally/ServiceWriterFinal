/**
 * Recurring Services Query — Read operations for recurring services page.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface RecurringServiceCatalogItem {
  id: string;
  name: string;
}

export interface RecurringCustomer {
  id: string;
  name: string;
}

export interface RecurringVehicle {
  id: string;
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
}

export interface RecurringServicesLookupData {
  serviceCatalog: RecurringServiceCatalogItem[];
  customers: RecurringCustomer[];
  vehicles: RecurringVehicle[];
}

export interface RecurringServiceRecord {
  id: string;
  service_catalog_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  frequency: "days" | "weeks" | "months" | "years";
  interval: number;
  start_date: string;
  next_due_date: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateRecurringServiceInput {
  service_catalog_id: string;
  customer_id?: string;
  vehicle_id?: string;
  frequency: "days" | "weeks" | "months" | "years";
  interval: number;
  start_date: string;
}

export async function fetchRecurringServicesLookupData(): Promise<RecurringServicesLookupData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");

  const [catalogRes, customersRes, vehiclesRes] = await Promise.all([
    supabase.from("service_catalog").select("id, name"),
    supabase.from("customers").select("id, name"),
    supabase.from("vehicles").select("id, customer_id, make, model, year"),
  ]);

  return {
    serviceCatalog: catalogRes.data ?? [],
    customers: customersRes.data ?? [],
    vehicles: vehiclesRes.data ?? [],
  };
}

export async function fetchRecurringServices(): Promise<RecurringServiceRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("recurring_services")
    .select("id, service_catalog_id, customer_id, vehicle_id, frequency, interval, start_date, next_due_date, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RecurringServiceRecord[];
}
