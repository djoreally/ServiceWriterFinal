/**
 * Fleet Client Detail Query — Read operations for FleetClientDetail page.
 */
import { apiClient } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";

type RawResult<T> = { data: T | null; error: unknown };

type FleetClientRow = Database["public"]["Tables"]["fleet_clients"]["Row"];
type FleetVehicleRow = Database["public"]["Tables"]["fleet_vehicles"]["Row"];
type FleetWorkOrderRow = Database["public"]["Tables"]["fleet_work_orders"]["Row"];
type FleetLocationRow = Database["public"]["Tables"]["fleet_locations"]["Row"];
type FleetContractRow = Database["public"]["Tables"]["fleet_contracts"]["Row"];
type FleetPurchaseOrderRow = Database["public"]["Tables"]["fleet_purchase_orders"]["Row"];
type FleetContactRow = Database["public"]["Tables"]["fleet_contacts"]["Row"];

type ClientVehicleRow = FleetVehicleRow & {
  fleet_locations: { name: string } | null;
  fleet_contracts: { name: string } | null;
};
type ClientWorkOrderRow = FleetWorkOrderRow & {
  fleet_vehicles: { year: number | null; make: string | null; model: string | null; unit_number: string | null } | null;
};

async function rawGet<T>(path: string): Promise<RawResult<T>> {
  try {
    const { data } = await apiClient.get<{ data: T }>(path);
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch a fleet client by ID. */
export async function fetchFleetClient(id: string, userId: string) {
  return rawGet<FleetClientRow>(`/v1/fleet/clients/${id}`);
}

/** Fetch entity counts for a client. */
export async function fetchClientCounts(clientId: string) {
  const { data } = await apiClient.get<{
    data: { vehicles: number; workOrders: number; locations: number; contacts: number; contracts: number };
  }>(`/v1/fleet/clients/${clientId}/counts`);
  return (
    data ?? { vehicles: 0, workOrders: 0, locations: 0, contacts: 0, contracts: 0 }
  );
}

export interface FleetClientReadiness {
  readyForService: boolean;
  readyForAutomatedInvoices: boolean;
  counts: { contacts: number; locations: number; contracts: number; purchaseOrders: number; vehicles: number; incompleteVehicles: number };
  blockers: Array<{ key: string; label: string; tab: "contacts" | "locations" | "contracts" | "pos" | "vehicles" }>;
}

export function deriveFleetClientReadiness(counts: FleetClientReadiness["counts"]): FleetClientReadiness {
  const blockers: FleetClientReadiness["blockers"] = [];
  if (!counts.contacts) blockers.push({ key: "contacts", label: "Add an operations or AP contact", tab: "contacts" });
  if (!counts.locations) blockers.push({ key: "locations", label: "Add a service location", tab: "locations" });
  if (!counts.contracts) blockers.push({ key: "contracts", label: "Activate a service contract", tab: "contracts" });
  if (!counts.purchaseOrders) blockers.push({ key: "pos", label: "Add an open purchase order", tab: "pos" });
  if (!counts.vehicles) blockers.push({ key: "vehicles", label: "Import or add vehicles", tab: "vehicles" });
  else if (counts.incompleteVehicles) blockers.push({ key: "vehicle_data", label: `Resolve data on ${counts.incompleteVehicles} vehicle${counts.incompleteVehicles === 1 ? "" : "s"}`, tab: "vehicles" });
  const readyForService = counts.contacts > 0 && counts.locations > 0 && counts.vehicles > 0 && counts.incompleteVehicles === 0;
  return { readyForService, readyForAutomatedInvoices: readyForService && counts.contracts > 0 && counts.purchaseOrders > 0, counts, blockers };
}

/** Server-counted onboarding readiness. Contracts and POs are mandatory for automated invoicing. */
export async function fetchFleetClientReadiness(clientId: string): Promise<FleetClientReadiness> {
  const { data } = await apiClient.get<{ data: FleetClientReadiness["counts"] }>(
    `/v1/fleet/clients/${clientId}/readiness-counts`,
  );
  const counts = data ?? {
    contacts: 0,
    locations: 0,
    contracts: 0,
    purchaseOrders: 0,
    vehicles: 0,
    incompleteVehicles: 0,
  };
  return deriveFleetClientReadiness(counts);
}

/** Fetch vehicles for a client. */
export async function fetchClientVehicles(clientId: string) {
  return rawGet<ClientVehicleRow[]>(`/v1/fleet/clients/${clientId}/vehicles`);
}

/** Fetch work orders for a client. */
export async function fetchClientWorkOrders(clientId: string) {
  return rawGet<ClientWorkOrderRow[]>(`/v1/fleet/clients/${clientId}/work-orders`);
}

/** Fetch locations for a client. */
export async function fetchClientLocations(clientId: string) {
  return rawGet<FleetLocationRow[]>(`/v1/fleet/clients/${clientId}/locations`);
}

/** Fetch contracts for a client. */
export async function fetchClientContracts(clientId: string) {
  return rawGet<FleetContractRow[]>(`/v1/fleet/clients/${clientId}/contracts`);
}

/** Fetch invoiceable work orders for a client. */
export async function fetchClientInvoices(clientId: string) {
  return rawGet<ClientWorkOrderRow[]>(`/v1/fleet/clients/${clientId}/invoices`);
}

/** Fetch purchase orders for a client. */
export async function fetchClientPurchaseOrders(clientId: string) {
  return rawGet<FleetPurchaseOrderRow[]>(`/v1/fleet/clients/${clientId}/purchase-orders`);
}

/** Fetch report stats for a client. */
export async function fetchClientReportStats(clientId: string) {
  const { data } = await apiClient.get<{
    data: { totalSpend: number; vehicleCount: number; woCount: number };
  }>(`/v1/fleet/clients/${clientId}/report-stats`);
  return data ?? { totalSpend: 0, vehicleCount: 0, woCount: 0 };
}

/** Fetch contacts for a client. */
export async function fetchClientContacts(clientId: string) {
  return rawGet<FleetContactRow[]>(`/v1/fleet/clients/${clientId}/contacts`);
}
