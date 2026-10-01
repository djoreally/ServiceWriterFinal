/** Service Invoice Query — canonical service-record invoice/print adapter.
 *
 * Phase 2: the print bundle is fetched through the typed API client
 * (`@/lib/api-client`) from the documents Hono router; presentation
 * shaping stays client-side. Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export interface InvoiceServiceData {
  id: string;
  service_number: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  shop_supplies: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  technician: string | null;
  mileage: number | null;
  vin_captured: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_engine: string | null;
  license_plate: string | null;
  odometer_measure: string | null;
}

export interface InvoiceLaborItem { id: string; description: string; hours: number; rate: number; total_price: number; }
export interface InvoiceServiceItem { id: string; description: string; quantity: number; unit_price: number; total_price: number; }
export interface InvoiceBusinessProfile { business_name: string; owner_name: string; phone: string; email: string; address: string; logo_url: string; }
export interface InvoiceCustomerData { name: string; email: string | null; phone: string | null; address: string | null; created_at: string; }
export interface InvoiceVehicleData {
  make: string; model: string; year: number; license_plate: string | null; vin: string | null;
  mileage: number | null; color: string | null; oil_type?: string | null; oil_capacity?: string | null; engine?: string | null;
}
export interface InvoiceData {
  service: InvoiceServiceData | null; customer: InvoiceCustomerData | null; vehicle: InvoiceVehicleData | null;
  business: InvoiceBusinessProfile | null; laborItems: InvoiceLaborItem[]; serviceItems: InvoiceServiceItem[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export async function fetchInvoiceData(serviceId: string, customerId: string | null, vehicleId: string | null): Promise<InvoiceData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before viewing a service invoice.");

  const response = await apiClient.get<{
    data: {
      service: Record<string, any> | null;
      customer: Record<string, any> | null;
      vehicle: Record<string, any> | null;
      workspace: { name: string } | null;
      settings: Record<string, any> | null;
      lines: Array<Record<string, any>>;
      specs: Record<string, any> | null;
    };
  }>(`/v1/service-invoices/${encodeURIComponent(serviceId)}`, {
    query: {
      workspace_id: workspaceId,
      customer_id: customerId ?? undefined,
      vehicle_id: vehicleId ?? undefined,
    },
  });

  const row = response.data.service;
  if (!row) return { service: null, customer: null, vehicle: null, business: null, laborItems: [], serviceItems: [] };

  const meta = object(row.metadata);
  const vehicleSnapshot = object(meta.vehicle_snapshot);
  const rawVehicle = response.data.vehicle;
  const specs = response.data.specs;
  const lines = response.data.lines ?? [];

  const service: InvoiceServiceData = {
    id: row.id,
    service_number: meta.service_number ? String(meta.service_number) : null,
    service_date: (row.completed_at ?? row.started_at ?? row.created_at)?.slice(0, 10) ?? "",
    service_type: String(meta.service_type ?? meta.title ?? row.work_performed ?? "Service"),
    description: row.work_performed ?? String(meta.description ?? ""),
    parts_used: meta.parts_used != null ? String(meta.parts_used) : null,
    labor_hours: meta.labor_hours == null ? null : Number(meta.labor_hours),
    labor_cost: meta.labor_cost == null ? null : Number(meta.labor_cost),
    parts_cost: meta.parts_cost == null ? null : Number(meta.parts_cost),
    total_cost: Number(row.total_amount ?? row.subtotal ?? meta.total_cost ?? 0),
    status: row.status,
    notes: row.customer_notes ?? row.internal_notes ?? (meta.notes != null ? String(meta.notes) : null),
    tax_rate: row.tax_rate == null ? null : Number(row.tax_rate),
    tax_amount: row.tax_amount == null ? null : Number(row.tax_amount),
    discount_amount: row.discount_amount == null ? null : Number(row.discount_amount),
    shop_supplies: meta.shop_supplies == null ? null : Number(meta.shop_supplies),
    payment_status: meta.payment_status == null ? null : String(meta.payment_status),
    paid_amount: meta.paid_amount == null ? null : Number(meta.paid_amount),
    technician: meta.technician == null ? null : String(meta.technician),
    mileage: meta.mileage == null ? null : Number(meta.mileage),
    vin_captured: nullableString(meta.vin ?? vehicleSnapshot.vin),
    vehicle_year: nullableNumber(vehicleSnapshot.year ?? rawVehicle?.year),
    vehicle_make: nullableString(vehicleSnapshot.make ?? rawVehicle?.make),
    vehicle_model: nullableString(vehicleSnapshot.model ?? rawVehicle?.model),
    vehicle_trim: nullableString(vehicleSnapshot.trim ?? rawVehicle?.trim),
    vehicle_engine: nullableString(vehicleSnapshot.engine ?? specs?.engine ?? object(rawVehicle?.metadata).engine),
    license_plate: nullableString(vehicleSnapshot.license_plate ?? rawVehicle?.license_plate),
    odometer_measure: String(meta.odometer_measure ?? rawVehicle?.mileage_unit ?? "mi"),
  };

  const customerRow = response.data.customer;
  const customer: InvoiceCustomerData | null = customerRow ? {
    name: [customerRow.first_name, customerRow.last_name].filter(Boolean).join(" ").trim() || customerRow.company_name || "Customer",
    email: customerRow.email ?? null,
    phone: customerRow.phone ?? null,
    address: [customerRow.address_line1, customerRow.address_line2, customerRow.city, customerRow.region, customerRow.postal_code].filter(Boolean).join(", ") || null,
    created_at: customerRow.created_at,
  } : null;

  const vehicle: InvoiceVehicleData | null = rawVehicle ? {
    make: rawVehicle.make,
    model: rawVehicle.model,
    year: Number(rawVehicle.year),
    license_plate: rawVehicle.license_plate ?? null,
    vin: rawVehicle.vin ?? null,
    mileage: rawVehicle.mileage ?? null,
    color: rawVehicle.color ?? null,
    oil_type: specs?.oil_type ?? null,
    oil_capacity: specs?.oil_capacity ?? null,
    engine: nullableString(specs?.engine ?? object(rawVehicle.metadata).engine),
  } : null;

  const settings = response.data.settings;
  const business: InvoiceBusinessProfile | null = response.data.workspace ? {
    business_name: response.data.workspace.name || "",
    owner_name: settings?.owner_name || "",
    phone: settings?.phone || "",
    email: settings?.email || "",
    address: [settings?.address_line1, settings?.address_line2, settings?.city, settings?.region, settings?.postal_code].filter(Boolean).join(", "),
    logo_url: settings?.logo_url || "",
  } : null;

  const laborItems: InvoiceLaborItem[] = lines
    .filter((line) => line.item_type === "labor" || Number(line.labor_hours ?? 0) > 0)
    .map((line) => ({
      id: line.id,
      description: line.description,
      hours: Number(line.labor_hours ?? line.quantity ?? 0),
      rate: Number(line.labor_rate ?? line.unit_price ?? 0),
      total_price: Number(line.total_price ?? 0),
    }));
  const serviceItems: InvoiceServiceItem[] = lines
    .filter((line) => line.item_type !== "labor")
    .map((line) => ({ id: line.id, description: line.description, quantity: Number(line.quantity ?? 0), unit_price: Number(line.unit_price ?? 0), total_price: Number(line.total_price ?? 0) }));

  return { service, customer, vehicle, business, laborItems, serviceItems };
}

/** Final has no transactional email provider runtime yet. */
export async function sendInvoiceEmail(_params: {
  to: string; customerName: string; type: "invoice" | "reminder"; documentNumber: string;
  businessName: string; businessEmail?: string; totalAmount: string; vehicleInfo?: string;
  serviceDescription: string; paymentStatus: string | null; notes: string | null;
}): Promise<void> {
  throw new Error("Invoice email provider is not configured on Final yet.");
}
