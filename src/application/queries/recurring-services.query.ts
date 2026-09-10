/**
 * Recurring Services Query — workspace-scoped read operations for recurring services page.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

const db = supabase as any;

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

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: context.workspaceId };
}

export async function fetchRecurringServicesLookupData(): Promise<RecurringServicesLookupData> {
  const { workspaceId } = await requireContext();

  const [catalogRes, customersRes, vehiclesRes] = await Promise.all([
    db.from("service_catalog").select("id,name").eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    db.from("customers").select("id,first_name,last_name,company_name").eq("workspace_id", workspaceId).neq("status", "archived").order("first_name"),
    db.from("vehicles").select("id,customer_id,make,model,year").eq("workspace_id", workspaceId).order("year", { ascending: false }),
  ]);

  if (catalogRes.error) throw catalogRes.error;
  if (customersRes.error) throw customersRes.error;
  if (vehiclesRes.error) throw vehiclesRes.error;

  return {
    serviceCatalog: (catalogRes.data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name || "Service") })),
    customers: (customersRes.data ?? []).map((row: any) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
    })),
    vehicles: (vehiclesRes.data ?? []).map((row: any) => ({
      id: String(row.id),
      customer_id: row.customer_id ? String(row.customer_id) : null,
      make: String(row.make || ""),
      model: String(row.model || ""),
      year: Number(row.year || 0),
    })),
  };
}

export async function fetchRecurringServices(): Promise<RecurringServiceRecord[]> {
  const { userId } = await requireContext();

  // recurring_services is still a legacy user-owned table; keep its current
  // ownership key until that table itself is migrated. All referenced customer,
  // vehicle, and catalog lookup data above is canonical workspace-scoped.
  const { data, error } = await supabase
    .from("recurring_services")
    .select("id, service_catalog_id, customer_id, vehicle_id, frequency, interval, start_date, next_due_date, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RecurringServiceRecord[];
}
