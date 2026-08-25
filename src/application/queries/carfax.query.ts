/** CARFAX Query — canonical workspace settings and service-history stats. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CarfaxSettingsData {
  carfax_location_id: string;
  city: string;
  state: string;
  postal_code: string;
  website_url: string;
  business_name: string;
  address: string;
  phone: string;
  carfax_activated?: boolean;
  carfax_activation_date?: string | null;
}

export interface CarfaxExportRecord {
  id: string; export_type: string; file_name: string; record_count: number;
  export_date: string; status: string; created_at: string;
}
export interface CarfaxDataStats { totalServices: number; validVins: number; missingData: number; }

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function fetchCarfaxSettings(): Promise<CarfaxSettingsData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const client = supabase as any;
  const [{ data: workspace }, { data: settings }] = await Promise.all([
    client.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    client.from("workspace_settings").select("phone,address_line1,address_line2,city,region,postal_code,website_url,operational_settings").eq("workspace_id", context.workspaceId).maybeSingle(),
  ]);
  if (!workspace) return null;
  const operational = object(settings?.operational_settings);
  const carfax = object(operational.carfax);
  return {
    carfax_location_id: typeof carfax.location_id === "string" ? carfax.location_id : "",
    city: settings?.city || "",
    state: settings?.region || "",
    postal_code: settings?.postal_code || "",
    website_url: settings?.website_url || "",
    business_name: workspace.name || "",
    address: [settings?.address_line1, settings?.address_line2].filter(Boolean).join(", "),
    phone: settings?.phone || "",
    carfax_activated: Boolean(carfax.location_id),
    carfax_activation_date: typeof carfax.activation_date === "string" ? carfax.activation_date : null,
  };
}

/** Final does not persist a CARFAX export-log table yet. */
export async function fetchCarfaxExports(): Promise<CarfaxExportRecord[]> {
  return [];
}

export async function fetchCarfaxDataStats(): Promise<CarfaxDataStats> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { totalServices: 0, validVins: 0, missingData: 0 };
  const { data, error } = await (supabase.from("service_records") as any)
    .select("id,vehicle_id,vehicles(vin)")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "completed");
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const totalServices = rows.length;
  const validVins = rows.filter((service) => service.vehicles?.vin?.length === 17).length;
  return { totalServices, validVins, missingData: totalServices - validVins };
}
