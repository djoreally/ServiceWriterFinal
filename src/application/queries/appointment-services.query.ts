/** Appointment service line items from the canonical workspace schema. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface AppointmentServiceRow {
  id: string;
  appointment_id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  service_catalog_id: string | null;
  is_prepaid: boolean | null;
  added_at_service: boolean | null;
  created_at: string | null;
}

export interface FeeSettings {
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee_type: string;
  shop_fee_value: number;
  shop_fee_description: string;
  surcharge_enabled: boolean;
  surcharge_type: string;
  surcharge_value: number;
  surcharge_description: string;
}

export interface CatalogServiceInfo { id: string; name: string; description: string | null; default_price: number; }

type ItemRow = {
  id: string; appointment_id: string; description: string; quantity: number; unit_price: number;
  service_catalog_id: string | null; is_prepaid: boolean | null; added_at_service: boolean | null; created_at: string | null;
  service_catalog: { id: string; name: string; description: string | null; labor_price: number } | null;
};

export async function fetchAppointmentServices(appointmentId: string, serviceCatalogId?: string | null): Promise<{ services: AppointmentServiceRow[]; catalogService: CatalogServiceInfo | null }> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const { data, error } = await productionSupabase
    .from("appointment_items")
    .select("id,appointment_id,description,quantity,unit_price,service_catalog_id,is_prepaid,added_at_service,created_at,service_catalog(id,name,description,labor_price)")
    .eq("workspace_id", context.workspaceId)
    .eq("appointment_id", appointmentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const services = ((data ?? []) as unknown as ItemRow[]).map((item) => ({
    id: item.id, appointment_id: item.appointment_id,
    name: item.service_catalog?.name ?? item.description,
    description: item.service_catalog?.description ?? item.description ?? null,
    price: Number(item.unit_price), quantity: Number(item.quantity),
    service_catalog_id: item.service_catalog_id, is_prepaid: item.is_prepaid,
    added_at_service: item.added_at_service, created_at: item.created_at,
  }));
  if (services.length) return { services, catalogService: null };

  const appointment = await productionSupabase.from("appointments").select("metadata")
    .eq("workspace_id", context.workspaceId).eq("id", appointmentId).maybeSingle();
  if (appointment.error) throw appointment.error;
  const metadata = appointment.data?.metadata && typeof appointment.data.metadata === "object" && !Array.isArray(appointment.data.metadata)
    ? appointment.data.metadata as Record<string, unknown> : {};
  const metadataCatalogId = typeof metadata.service_catalog_id === "string" ? metadata.service_catalog_id : null;
  const catalogId = serviceCatalogId ?? metadataCatalogId;
  if (!catalogId) return { services, catalogService: null };

  const { data: catalog, error: catalogError } = await productionSupabase
    .from("service_catalog").select("id,name,description,labor_price")
    .eq("workspace_id", context.workspaceId).eq("id", catalogId).maybeSingle();
  if (catalogError) throw catalogError;
  return { services, catalogService: catalog ? { id: catalog.id, name: catalog.name, description: catalog.description, default_price: Number(catalog.labor_price) } : null };
}

export async function fetchFeeSettings(): Promise<FeeSettings | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const { data, error } = await productionSupabase
    .from("workspace_settings")
    .select("waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description")
    .eq("workspace_id", context.workspaceId).maybeSingle();
  if (error) throw error;
  return data as FeeSettings | null;
}
