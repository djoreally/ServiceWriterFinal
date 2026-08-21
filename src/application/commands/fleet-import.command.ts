/**
 * Fleet Import Commands — Bulk insert clients and vehicles from CSV/Excel
 * 
 * Validates and maps user-provided rows to the fleet_clients and fleet_vehicles tables.
 * Inserts in batches of 100 to avoid payload limits.
 */

import { supabase } from "@/integrations/supabase/client";

/* ────────── Shared helpers ────────── */

const BATCH_SIZE = 100;

async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await (supabase as any).from(table).insert(batch);
    if (error) {
      errors.push(`Rows ${i + 1}–${i + batch.length}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

/* ────────── Client import ────────── */

export interface ImportClientRow {
  company_name: string;
  billing_email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  payment_terms?: string;
  notes?: string;
  ap_contact_name?: string;
  ap_contact_email?: string;
  ap_contact_phone?: string;
  fleet_manager_name?: string;
  fleet_manager_email?: string;
  fleet_manager_phone?: string;
}

const VALID_PAYMENT_TERMS = ["due_on_receipt", "net_15", "net_30", "net_45", "net_60"];

export function validateClientRows(rows: Record<string, string>[]): {
  valid: ImportClientRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const valid: ImportClientRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((raw, i) => {
    const company_name = (raw.company_name || raw.Company || raw["Company Name"] || "").trim();
    if (!company_name) {
      errors.push({ row: i + 2, message: "Missing company name" });
      return;
    }

    const paymentRaw = (raw.payment_terms || raw["Payment Terms"] || "net_30").trim().toLowerCase().replace(/\s+/g, "_");
    const payment_terms = VALID_PAYMENT_TERMS.includes(paymentRaw) ? paymentRaw : "net_30";

    valid.push({
      company_name,
      billing_email: raw.billing_email || raw["Billing Email"] || raw.email || raw.Email || undefined,
      phone: raw.phone || raw.Phone || undefined,
      address: raw.address || raw.Address || undefined,
      city: raw.city || raw.City || undefined,
      state: raw.state || raw.State || undefined,
      postal_code: raw.postal_code || raw["Postal Code"] || raw.zip || raw.Zip || undefined,
      payment_terms,
      notes: raw.notes || raw.Notes || undefined,
      ap_contact_name: raw.ap_contact_name || raw["AP Contact Name"] || undefined,
      ap_contact_email: raw.ap_contact_email || raw["AP Contact Email"] || undefined,
      ap_contact_phone: raw.ap_contact_phone || raw["AP Contact Phone"] || undefined,
      fleet_manager_name: raw.fleet_manager_name || raw["Fleet Manager Name"] || undefined,
      fleet_manager_email: raw.fleet_manager_email || raw["Fleet Manager Email"] || undefined,
      fleet_manager_phone: raw.fleet_manager_phone || raw["Fleet Manager Phone"] || undefined,
    });
  });

  return { valid, errors };
}

export async function importFleetClients(
  userId: string,
  clients: ImportClientRow[]
): Promise<{ inserted: number; errors: string[] }> {
  const rows = clients.map((c) => ({
    user_id: userId,
    company_name: c.company_name,
    billing_email: c.billing_email || null,
    phone: c.phone || null,
    address: c.address || null,
    city: c.city || null,
    state: c.state || null,
    postal_code: c.postal_code || null,
    payment_terms: c.payment_terms || "net_30",
    notes: c.notes || null,
    ap_contact_name: c.ap_contact_name || null,
    ap_contact_email: c.ap_contact_email || null,
    ap_contact_phone: c.ap_contact_phone || null,
    fleet_manager_name: c.fleet_manager_name || null,
    fleet_manager_email: c.fleet_manager_email || null,
    fleet_manager_phone: c.fleet_manager_phone || null,
  }));

  return batchInsert("fleet_clients", rows);
}

/* ────────── Vehicle import ────────── */

export interface ImportVehicleRow {
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  unit_number?: string;
  color?: string;
  engine?: string;
  fuel_type?: string;
  mileage?: number;
  status?: string;
  notes?: string;
  /** Matched fleet_client_id (resolved during import) */
  fleet_client_id: string;
}

const VALID_VEHICLE_STATUSES = ["active", "inactive", "maintenance", "retired"];

export function validateVehicleRows(
  rows: Record<string, string>[],
  clientMap: Map<string, string> // company_name (lowercase) → fleet_client_id
): {
  valid: ImportVehicleRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const valid: ImportVehicleRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((raw, i) => {
    const clientName = (raw.client || raw.Client || raw.company_name || raw["Company Name"] || raw["Client Name"] || "").trim();
    if (!clientName) {
      errors.push({ row: i + 2, message: "Missing client/company name" });
      return;
    }

    const clientId = clientMap.get(clientName.toLowerCase());
    if (!clientId) {
      errors.push({ row: i + 2, message: `Client "${clientName}" not found. Create the client first.` });
      return;
    }

    const yearRaw = raw.year || raw.Year || "";
    const year = yearRaw ? parseInt(yearRaw, 10) : undefined;
    if (yearRaw && (isNaN(year!) || year! < 1900 || year! > 2030)) {
      errors.push({ row: i + 2, message: `Invalid year: ${yearRaw}` });
      return;
    }

    const mileageRaw = raw.mileage || raw.Mileage || raw.odometer || raw.Odometer || "";
    const mileage = mileageRaw ? parseInt(mileageRaw.replace(/[^0-9]/g, ""), 10) : undefined;

    const statusRaw = (raw.status || raw.Status || "active").trim().toLowerCase();
    const status = VALID_VEHICLE_STATUSES.includes(statusRaw) ? statusRaw : "active";

    valid.push({
      fleet_client_id: clientId,
      year,
      make: raw.make || raw.Make || undefined,
      model: raw.model || raw.Model || undefined,
      vin: raw.vin || raw.VIN || undefined,
      license_plate: raw.license_plate || raw["License Plate"] || raw.plate || raw.Plate || undefined,
      unit_number: raw.unit_number || raw["Unit Number"] || raw["Unit #"] || raw.unit || undefined,
      color: raw.color || raw.Color || undefined,
      engine: raw.engine || raw.Engine || undefined,
      fuel_type: raw.fuel_type || raw["Fuel Type"] || raw.fuel || undefined,
      mileage,
      status,
      notes: raw.notes || raw.Notes || undefined,
    });
  });

  return { valid, errors };
}

export async function importFleetVehicles(
  userId: string,
  vehicles: ImportVehicleRow[]
): Promise<{ inserted: number; errors: string[] }> {
  const rows = vehicles.map((v) => ({
    user_id: userId,
    fleet_client_id: v.fleet_client_id,
    year: v.year ?? null,
    make: v.make || null,
    model: v.model || null,
    vin: v.vin || null,
    license_plate: v.license_plate || null,
    unit_number: v.unit_number || null,
    color: v.color || null,
    engine: v.engine || null,
    fuel_type: v.fuel_type || null,
    mileage: v.mileage ?? null,
    status: v.status || "active",
    notes: v.notes || null,
  }));

  return batchInsert("fleet_vehicles", rows);
}

/** Fetch all fleet clients for the user (used to build clientMap for vehicle import) */
export async function fetchFleetClientMap(userId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", userId);

  const map = new Map<string, string>();
  (data || []).forEach((c: any) => {
    map.set(c.company_name.toLowerCase(), c.id);
  });
  return map;
}

/** Column mappings for template downloads */
export const CLIENT_IMPORT_COLUMNS = [
  "Company Name", "Billing Email", "Phone", "Address", "City", "State",
  "Postal Code", "Payment Terms", "Notes", "AP Contact Name", "AP Contact Email",
  "AP Contact Phone", "Fleet Manager Name", "Fleet Manager Email", "Fleet Manager Phone",
];

export const VEHICLE_IMPORT_COLUMNS = [
  "Client Name", "Year", "Make", "Model", "VIN", "License Plate",
  "Unit Number", "Color", "Engine", "Fuel Type", "Mileage", "Status", "Notes",
];
