/** CARFAX Command — canonical settings and feed generation. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function saveCarfaxSettings(settings: {
  carfax_location_id: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  website_url: string | null;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving CARFAX settings.");
  const client = supabase as any;
  const { data: current, error: readError } = await client.from("workspace_settings")
    .select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle();
  if (readError) throw readError;
  const operational = object(current?.operational_settings);
  const existingCarfax = object(operational.carfax);
  const nextCarfax = {
    ...existingCarfax,
    location_id: settings.carfax_location_id || null,
    activation_date: settings.carfax_location_id
      ? existingCarfax.activation_date || new Date().toISOString()
      : null,
  };
  const { error } = await client.from("workspace_settings").update({
    city: settings.city || null,
    region: settings.state || null,
    postal_code: settings.postal_code || null,
    website_url: settings.website_url || null,
    operational_settings: { ...operational, carfax: nextCarfax },
  }).eq("workspace_id", context.workspaceId);
  if (error) throw new Error("Failed to save CARFAX settings");
}

interface ActivateCarfaxShopData {
  businessName: string; address: string; city: string; state: string; zip: string;
  phone: string; url?: string; contactName: string;
}
interface ActivateCarfaxShopResponse { success: boolean; locationId?: string; error?: string; }

/** CARFAX remote activation requires a provider integration that Final does not yet have. */
export async function activateCarfaxShop(_data: ActivateCarfaxShopData): Promise<ActivateCarfaxShopResponse> {
  throw new Error("CARFAX activation provider is not configured on Final yet.");
}

/** Feed download remains functional; Final does not yet persist a separate export-log table. */
export async function recordCarfaxExport(_exportType: string, _fileName: string, _recordCount: number): Promise<void> {
  return;
}

interface CarfaxExportVehicle {
  vin: string | null; make: string | null; model: string | null; year: number | null;
  license_plate: string | null; plate_state: string | null; mileage: number | null; odometer_measure: string | null;
}
interface CarfaxSourceVehicle {
  vin: string | null; make: string | null; model: string | null; year: number | null;
  license_plate: string | null; plate_region: string | null; mileage: number | null; mileage_unit: string | null;
}
interface CarfaxExportLaborItem { description: string | null; }
interface CarfaxExportServiceItem { description: string | null; quantity: number | null; }
interface CarfaxSourceLine {
  item_type: string | null;
  description: string | null;
  quantity: number | null;
  labor_hours: number | null;
}
interface CarfaxSourceRow {
  id: string;
  work_performed: string | null;
  metadata: unknown;
  completed_at: string | null;
  created_at: string;
  vehicles: CarfaxSourceVehicle | null;
  service_record_line_items: CarfaxSourceLine[] | null;
}
export interface CarfaxExportServiceRecord {
  id: string; service_number: string | null; service_date: string | null; service_type: string | null;
  description: string | null; created_at: string; vehicles: CarfaxExportVehicle;
  labor_items: CarfaxExportLaborItem[] | null; service_items: CarfaxExportServiceItem[] | null;
}
interface CarfaxFeedBusiness {
  carfax_location_id?: string | null; business_name?: string | null; address?: string | null;
  city?: string | null; state?: string | null; postal_code?: string | null; phone?: string | null; website_url?: string | null;
}

export async function fetchCarfaxExportServices(exportType: "PROD" | "HIST"): Promise<CarfaxExportServiceRecord[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before exporting CARFAX service history.");
  const client = supabase as any;
  const { data, error } = await client.from("service_records")
    .select("id,vehicle_id,work_performed,metadata,completed_at,created_at,vehicles(vin,make,model,year,license_plate,plate_region,mileage,mileage_unit),service_record_line_items(id,item_type,description,quantity,labor_hours)")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "completed")
    .not("vehicle_id", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false });
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  return ((data ?? []) as unknown as CarfaxSourceRow[])
    .map((row): CarfaxExportServiceRecord => {
      const meta = object(row.metadata);
      const completedDate = (row.completed_at ?? row.created_at)?.slice(0, 10) ?? null;
      const vehicle = row.vehicles;
      const lines = row.service_record_line_items ?? [];
      return {
        id: row.id,
        service_number: meta.service_number ? String(meta.service_number) : row.id.slice(0, 8).toUpperCase(),
        service_date: completedDate,
        service_type: String(meta.service_type ?? meta.title ?? "Service"),
        description: row.work_performed ?? (meta.description ? String(meta.description) : null),
        created_at: row.created_at,
        vehicles: {
          vin: meta.vin ? String(meta.vin) : vehicle?.vin ?? null,
          make: vehicle?.make ?? null,
          model: vehicle?.model ?? null,
          year: vehicle?.year ?? null,
          license_plate: vehicle?.license_plate ?? null,
          plate_state: vehicle?.plate_region ?? null,
          mileage: meta.mileage != null ? Number(meta.mileage) : vehicle?.mileage ?? null,
          odometer_measure: meta.odometer_measure ? String(meta.odometer_measure) : vehicle?.mileage_unit ?? "MI",
        },
        labor_items: lines.filter((line) => line.item_type === "labor" || Number(line.labor_hours ?? 0) > 0).map((line) => ({ description: line.description ?? null })),
        service_items: lines.filter((line) => line.item_type !== "labor").map((line) => ({ description: line.description ?? null, quantity: line.quantity == null ? null : Number(line.quantity) })),
      };
    })
    .filter((row) => exportType === "HIST" || row.service_date === today);
}

export function formatCarfaxFeed(services: CarfaxExportServiceRecord[], business: CarfaxFeedBusiness): string {
  const headers = [
    "VIN", "RO_OPEN_DATE", "RO_CLOSE_DATE", "MILEAGE", "ODOMETER_MEASURE",
    "RO_INVOICE_NUMBER", "SERVICE_DESCRIPTION", "LABOR_DESCRIPTION",
    "PART_NAME_DESCRIPTION", "PART_QUANTITY", "MAKE", "MODEL", "MODEL_YEAR",
    "PLATE", "PLATE_STATE", "MANAGEMENT_SYSTEM", "LOCATION_ID", "LOCATION_NAME",
    "ADDRESS", "CITY", "STATE", "POSTAL_CODE", "PHONE", "URL"
  ];
  const headerRow = headers.map((h) => `"${h}"`).join("|");
  const rows = services.map((s) => {
    const v = s.vehicles;
    const date = s.service_date ? new Date(`${s.service_date}T00:00:00`).toLocaleDateString("en-US") : "";
    return [
      v.vin || "", date, date, v.mileage || "", v.odometer_measure || "MI", s.service_number || "",
      s.description || "", s.labor_items?.[0]?.description || "", s.service_items?.[0]?.description || "",
      s.service_items?.[0]?.quantity || "0", v.make || "", v.model || "", v.year || "", v.license_plate || "",
      v.plate_state || "", "SERVICE_WRITER", business.carfax_location_id || "", business.business_name || "",
      business.address || "", business.city || "", business.state || "", business.postal_code || "",
      business.phone || "", business.website_url || ""
    ].map((val) => `"${val}"`).join("|");
  });
  return [headerRow, ...rows].join("\n");
}
