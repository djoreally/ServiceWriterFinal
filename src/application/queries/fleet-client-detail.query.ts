/**
 * Fleet Client Detail Query — Read operations for FleetClientDetail page.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fetch a fleet client by ID. */
export async function fetchFleetClient(id: string, userId: string) {
  return supabase.from("fleet_clients").select("*").eq("id", id).eq("user_id", userId).single();
}

/** Fetch entity counts for a client. */
export async function fetchClientCounts(clientId: string) {
  const [v, wo, loc, con, ct] = await Promise.all([
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_locations").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_contacts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_contracts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
  ]);
  return {
    vehicles: v.count ?? 0,
    workOrders: wo.count ?? 0,
    locations: loc.count ?? 0,
    contacts: con.count ?? 0,
    contracts: ct.count ?? 0,
  };
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
  const [contacts, locations, contracts, purchaseOrders, vehicles, incompleteVehicles] = await Promise.all([
    supabase.from("fleet_contacts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_locations").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_contracts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId).eq("is_active", true),
    supabase.from("fleet_purchase_orders").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId).in("status", ["open", "partially_used"]),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId)
      .or("vin.is.null,mileage.is.null,fleet_location_id.is.null,fleet_contract_id.is.null"),
  ]);
  const counts = {
    contacts: contacts.count ?? 0,
    locations: locations.count ?? 0,
    contracts: contracts.count ?? 0,
    purchaseOrders: purchaseOrders.count ?? 0,
    vehicles: vehicles.count ?? 0,
    incompleteVehicles: incompleteVehicles.count ?? 0,
  };
  return deriveFleetClientReadiness(counts);
}

/** Fetch vehicles for a client. */
export async function fetchClientVehicles(clientId: string) {
  return supabase
    .from("fleet_vehicles")
    .select("*, fleet_locations(name), fleet_contracts(name)")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
}

/** Fetch work orders for a client. */
export async function fetchClientWorkOrders(clientId: string) {
  return supabase
    .from("fleet_work_orders")
    .select("*, fleet_vehicles(year, make, model, unit_number)")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
}

/** Fetch locations for a client. */
export async function fetchClientLocations(clientId: string) {
  return supabase
    .from("fleet_locations")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("name");
}

/** Fetch contracts for a client. */
export async function fetchClientContracts(clientId: string) {
  return supabase
    .from("fleet_contracts")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
}

/** Fetch invoiceable work orders for a client. */
export async function fetchClientInvoices(clientId: string) {
  return supabase
    .from("fleet_work_orders")
    .select("*, fleet_vehicles(year, make, model, unit_number)")
    .eq("fleet_client_id", clientId)
    .in("status", ["completed", "invoiced", "paid"])
    .order("completed_at", { ascending: false });
}

/** Fetch purchase orders for a client. */
export async function fetchClientPurchaseOrders(clientId: string) {
  return supabase
    .from("fleet_purchase_orders")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
}

/** Fetch report stats for a client. */
export async function fetchClientReportStats(clientId: string) {
  const [vRes, woRes] = await Promise.all([
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    supabase.from("fleet_work_orders").select("id, total, status").eq("fleet_client_id", clientId),
  ]);
  const completed = (woRes.data ?? []).filter((order) => ["completed", "invoiced", "paid"].includes(order.status));
  const totalSpend = completed.reduce((sum, order) => sum + (order.total || 0), 0);
  return { totalSpend, vehicleCount: vRes.count ?? 0, woCount: (woRes.data ?? []).length };
}

/** Fetch contacts for a client. */
export async function fetchClientContacts(clientId: string) {
  return supabase
    .from("fleet_contacts")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("name");
}
