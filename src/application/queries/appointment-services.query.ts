/** Appointment service line items from the canonical workspace schema.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
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
  const response = await apiClient.get<{ data: { items: ItemRow[]; catalog_service: { id: string; name: string; description: string | null; labor_price: number | string | null } | null } }>(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/services`,
    { query: { ...(serviceCatalogId ? { service_catalog_id: serviceCatalogId } : {}), selected_workspace_id: context.workspaceId } },
  );
  const items = response.data?.items ?? [];

  const services = (items as unknown as ItemRow[]).map((item) => ({
    id: item.id, appointment_id: item.appointment_id,
    name: item.service_catalog?.name ?? item.description,
    description: item.service_catalog?.description ?? item.description ?? null,
    price: Number(item.unit_price), quantity: Number(item.quantity),
    service_catalog_id: item.service_catalog_id, is_prepaid: item.is_prepaid,
    added_at_service: item.added_at_service, created_at: item.created_at,
  }));
  if (services.length) return { services, catalogService: null };

  const catalog = response.data?.catalog_service ?? null;
  return { services, catalogService: catalog ? { id: catalog.id, name: catalog.name, description: catalog.description, default_price: Number(catalog.labor_price) } : null };
}

export async function fetchFeeSettings(): Promise<FeeSettings | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const response = await apiClient.get<{ data: FeeSettings | null }>(
    "/v1/appointments/fee-settings",
    { query: { selected_workspace_id: context.workspaceId } },
  );
  return response.data ?? null;
}
