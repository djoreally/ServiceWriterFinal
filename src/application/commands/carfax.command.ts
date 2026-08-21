/**
 * CARFAX Command - Save settings and generate exports.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveCarfaxSettings(settings: {
  carfax_location_id: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  website_url: string | null;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("business_profiles")
    .update({
      carfax_location_id: settings.carfax_location_id || null,
      city: settings.city || null,
      state: settings.state || null,
      postal_code: settings.postal_code || null,
      website_url: settings.website_url || null,
    })
    .eq("user_id", user.id);

  if (error) throw new Error("Failed to save settings");
}

interface ActivateCarfaxShopData {
  businessName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  url?: string;
  contactName: string;
}

interface ActivateCarfaxShopResponse {
  success: boolean;
  locationId?: string;
  error?: string;
}

export async function activateCarfaxShop(data: ActivateCarfaxShopData): Promise<ActivateCarfaxShopResponse> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data: response, error } = await supabase.functions.invoke<ActivateCarfaxShopResponse>("carfax-activate-shop", {
    body: {
      ...data,
      email: user.email || "",
    },
  });

  if (error) throw error;
  if (!response) throw new Error("CARFAX activation returned no response");
  return response;
}


export async function recordCarfaxExport(exportType: string, fileName: string, recordCount: number): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  await supabase.from("carfax_exports").insert({
    user_id: user.id,
    export_type: exportType,
    file_name: fileName,
    record_count: recordCount,
    status: "completed",
  });
}

interface CarfaxExportVehicle {
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  plate_state: string | null;
  mileage: number | null;
  odometer_measure: string | null;
}

interface CarfaxExportLaborItem {
  description: string | null;
}

interface CarfaxExportServiceItem {
  description: string | null;
  quantity: number | null;
}

export interface CarfaxExportServiceRecord {
  id: string;
  service_number: string | null;
  service_date: string | null;
  service_type: string | null;
  description: string | null;
  created_at: string;
  vehicles: CarfaxExportVehicle;
  labor_items: CarfaxExportLaborItem[] | null;
  service_items: CarfaxExportServiceItem[] | null;
}

interface CarfaxFeedBusiness {
  carfax_location_id?: string | null;
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  website_url?: string | null;
}

/**
 * Fetch completed services with vehicle/labor/parts data for CARFAX export.
 */
export async function fetchCarfaxExportServices(exportType: "PROD" | "HIST"): Promise<CarfaxExportServiceRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const dateFilter = exportType === "PROD"
    ? new Date().toISOString().split("T")[0]
    : undefined;

  let query = supabase
    .from("services")
    .select(`
      id, service_number, service_date, service_type, description, created_at,
      vehicles!inner(vin, make, model, year, license_plate, plate_state, mileage, odometer_measure),
      labor_items(description),
      service_items(description, quantity)
    `)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .not("vehicle_id", "is", null);

  if (dateFilter) {
    query = query.eq("service_date", dateFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CarfaxExportServiceRecord[];
}

/**
 * Format service records into CARFAX pipe-delimited text format.
 */
export function formatCarfaxFeed(services: CarfaxExportServiceRecord[], business: CarfaxFeedBusiness): string {
  const headers = [
    "VIN", "RO_OPEN_DATE", "RO_CLOSE_DATE", "MILEAGE", "ODOMETER_MEASURE",
    "RO_INVOICE_NUMBER", "SERVICE_DESCRIPTION", "LABOR_DESCRIPTION",
    "PART_NAME_DESCRIPTION", "PART_QUANTITY", "MAKE", "MODEL", "MODEL_YEAR",
    "PLATE", "PLATE_STATE", "MANAGEMENT_SYSTEM", "LOCATION_ID", "LOCATION_NAME",
    "ADDRESS", "CITY", "STATE", "POSTAL_CODE", "PHONE", "URL"
  ];

  const headerRow = headers.map(h => `"${h}"`).join("|");
  const rows = services.map(s => {
    const v = s.vehicles;
    const date = s.service_date ? new Date(s.service_date).toLocaleDateString('en-US') : "";
    
    return [
      v.vin || "",
      date,
      date,
      v.mileage || "",
      v.odometer_measure || "MI",
      s.service_number || "",
      s.description || "",
      s.labor_items?.[0]?.description || "",
      s.service_items?.[0]?.description || "",
      s.service_items?.[0]?.quantity || "0",
      v.make || "",
      v.model || "",
      v.year || "",
      v.license_plate || "",
      v.plate_state || "",
      "SERVICE_WRITER",
      business.carfax_location_id || "",
      business.business_name || "",
      business.address || "",
      business.city || "",
      business.state || "",
      business.postal_code || "",
      business.phone || "",
      business.website_url || ""
    ].map(val => `"${val}"`).join("|");
  });

  return [headerRow, ...rows].join("\n");
}

