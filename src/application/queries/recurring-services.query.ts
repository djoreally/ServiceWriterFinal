/**
 * Recurring Services Query — workspace-scoped read operations for recurring services page.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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

interface LookupBundle {
  catalog_items: Array<{ id: string; name: string | null }>;
  customers: Array<{ id: string; first_name: string | null; last_name: string | null; company_name: string | null }>;
  vehicles: Array<{ id: string; customer_id: string | null; make: string | null; model: string | null; year: number | null }>;
}

export async function fetchRecurringServicesLookupData(): Promise<RecurringServicesLookupData> {
  const { workspaceId } = await requireContext();

  const response = await apiClient.get<{ data: LookupBundle }>("/v1/recurring-services/lookup", {
    query: { workspace_id: workspaceId },
  });
  const bundle = response.data;

  return {
    serviceCatalog: (bundle.catalog_items ?? []).map((row) => ({ id: String(row.id), name: String(row.name || "Service") })),
    customers: (bundle.customers ?? []).map((row) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
    })),
    vehicles: (bundle.vehicles ?? []).map((row) => ({
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

  const response = await apiClient.get<{ data: RecurringServiceRecord[] }>("/v1/recurring-services", {
    query: { user_id: userId },
  });
  return response.data ?? [];
}
