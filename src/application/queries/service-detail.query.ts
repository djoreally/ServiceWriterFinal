/** Service Detail Query — canonical service-record detail with legacy UI adapter. */
import { supabase } from "@/integrations/supabase/client";
import { bankersRound } from "@/lib/financialMath";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface ServiceDetailData {
  id: string;
  service_number: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_id: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  status: string;
  notes: string | null;
  technician: string | null;
  oil_quarts_used: number | null;
  created_at: string;
  updated_at: string;
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

export interface ServiceDetailCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface ServiceDetailVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string | null;
  vin: string | null;
  mileage: number | null;
  color: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  engine: string | null;
}

export interface ServiceDetailLaborItem {
  id: string;
  description: string;
  hours: number;
}

export interface ServiceDetailTimelineEvent {
  id: string;
  status: string;
  timestamp: string;
  notes: string | null;
}

export interface ServiceDetailResult {
  service: ServiceDetailData;
  customer: ServiceDetailCustomer | null;
  vehicle: ServiceDetailVehicle | null;
  laborItems: ServiceDetailLaborItem[];
  timeline: ServiceDetailTimelineEvent[];
  businessName: string;
  businessEmail: string;
  guestInfo: { name: string; email?: string; phone?: string } | null;
  catalogDescription: string | null;
  catalogLaborHours: number | null;
  oilType: string | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

interface ServiceDetailCustomerRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  created_at: string;
}

interface VehicleServiceSpecRow {
  engine?: string | null;
  oil_type?: string | null;
  oil_capacity?: string | null;
}

interface ServiceDetailLineRow {
  id: string;
  item_type: string | null;
  description: string;
  quantity: number | null;
  labor_hours: number | null;
}

function customerAdapter(row: ServiceDetailCustomerRow | null | undefined): ServiceDetailCustomer | null {
  if (!row) return null;
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.company_name || "Customer",
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", ") || null,
    created_at: row.created_at,
  };
}

export async function fetchServiceDetail(serviceId: string): Promise<ServiceDetailResult | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const client = supabase as any;

  const { data: row, error } = await client
    .from("service_records")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("id", serviceId)
    .single();
  if (error || !row) return null;

  const metadata = object(row.metadata);
  const [customerRes, vehicleRes, linesRes, settingsRes, workspaceRes, appointmentRes] = await Promise.all([
    row.customer_id
      ? client.from("customers").select("*").eq("workspace_id", context.workspaceId).eq("id", row.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.vehicle_id
      ? client.from("vehicles").select("*").eq("workspace_id", context.workspaceId).eq("id", row.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from("service_record_line_items")
      .select("id,item_type,description,quantity,unit_price,total_price,labor_hours,labor_rate,metadata,created_at")
      .eq("workspace_id", context.workspaceId)
      .eq("service_record_id", serviceId)
      .order("sort_order"),
    client.from("workspace_settings").select("email").eq("workspace_id", context.workspaceId).maybeSingle(),
    client.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    row.appointment_id
      ? client.from("appointments").select("id,customer_id,vehicle_id,metadata,notes,starts_at").eq("workspace_id", context.workspaceId).eq("id", row.appointment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  let customer = customerAdapter(customerRes.data);
  const rawVehicle = vehicleRes.data;
  let specs: VehicleServiceSpecRow | null = null;
  if (row.vehicle_id) {
    const specRes = await client.from("vehicle_service_specs")
      .select("engine,oil_type,oil_capacity,oil_filter,metadata")
      .eq("workspace_id", context.workspaceId)
      .eq("vehicle_id", row.vehicle_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    specs = specRes.data as VehicleServiceSpecRow | null;
  }

  if (!customer && appointmentRes.data?.customer_id) {
    const fallbackCustomer = await client.from("customers").select("*")
      .eq("workspace_id", context.workspaceId).eq("id", appointmentRes.data.customer_id).maybeSingle();
    customer = customerAdapter(fallbackCustomer.data);
  }

  const appointmentMeta = object(appointmentRes.data?.metadata);
  const guestInfo = !customer && (appointmentMeta.guest_name || appointmentMeta.customer_name)
    ? {
        name: String(appointmentMeta.guest_name ?? appointmentMeta.customer_name),
        email: appointmentMeta.guest_email ? String(appointmentMeta.guest_email) : undefined,
        phone: appointmentMeta.guest_phone ? String(appointmentMeta.guest_phone) : undefined,
      }
    : null;

  let catalogDescription: string | null = null;
  let catalogLaborHours: number | null = null;
  if (row.appointment_id) {
    const { data: appointmentItems } = await client.from("appointment_items")
      .select("service_catalog_id,description,quantity,unit_price,service_catalog(name,description,estimated_duration)")
      .eq("workspace_id", context.workspaceId)
      .eq("appointment_id", row.appointment_id)
      .order("created_at")
      .limit(1);
    const item = appointmentItems?.[0];
    if (item?.service_catalog?.description) catalogDescription = item.service_catalog.description;
    else if (item?.description) catalogDescription = item.description;
    if (item?.service_catalog?.estimated_duration != null) {
      catalogLaborHours = bankersRound(Number(item.service_catalog.estimated_duration) / 60, 2);
    }
  }

  const serviceDate = row.completed_at ?? row.started_at ?? row.created_at;
  const vehicleSnapshot = object(metadata.vehicle_snapshot);
  const vehicle: ServiceDetailVehicle | null = rawVehicle ? {
    id: rawVehicle.id,
    make: rawVehicle.make,
    model: rawVehicle.model,
    year: Number(rawVehicle.year),
    license_plate: rawVehicle.license_plate ?? null,
    vin: rawVehicle.vin ?? null,
    mileage: rawVehicle.mileage ?? null,
    color: rawVehicle.color ?? null,
    oil_type: specs?.oil_type ?? null,
    oil_capacity: specs?.oil_capacity ?? null,
    engine: specs?.engine ?? optionalString(object(rawVehicle.metadata).engine),
  } : null;

  const lineRows = (linesRes.data ?? []) as ServiceDetailLineRow[];
  const laborItems: ServiceDetailLaborItem[] = lineRows
    .filter((line) => Number(line.labor_hours ?? 0) > 0 || line.item_type === "labor")
    .map((line) => ({ id: line.id, description: line.description, hours: Number(line.labor_hours ?? line.quantity ?? 0) }));

  const partsUsed = metadata.parts_used != null
    ? String(metadata.parts_used)
    : lineRows.filter((line) => line.item_type !== "labor").map((line) => line.description).join(", ") || null;

  const laborHours = metadata.labor_hours != null
    ? Number(metadata.labor_hours)
    : laborItems.length ? bankersRound(laborItems.reduce((sum, item) => sum + item.hours, 0), 2) : null;

  const service: ServiceDetailData = {
    id: row.id,
    service_number: metadata.service_number ? String(metadata.service_number) : null,
    customer_id: row.customer_id ?? null,
    vehicle_id: row.vehicle_id ?? null,
    appointment_id: row.appointment_id ?? null,
    service_date: serviceDate?.slice(0, 10) ?? "",
    service_type: String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service"),
    description: row.work_performed ?? String(metadata.description ?? ""),
    parts_used: partsUsed,
    labor_hours: laborHours,
    status: row.status,
    notes: row.customer_notes ?? row.internal_notes ?? (metadata.notes != null ? String(metadata.notes) : null),
    technician: metadata.technician ? String(metadata.technician) : null,
    oil_quarts_used: row.oil_quarts_used == null ? null : Number(row.oil_quarts_used),
    created_at: row.created_at,
    updated_at: row.updated_at,
    mileage: metadata.mileage != null ? Number(metadata.mileage) : null,
    vin_captured: metadata.vin ? String(metadata.vin) : vehicleSnapshot.vin ? String(vehicleSnapshot.vin) : null,
    vehicle_year: vehicleSnapshot.year != null ? Number(vehicleSnapshot.year) : rawVehicle?.year ?? null,
    vehicle_make: optionalString(vehicleSnapshot.make) ?? rawVehicle?.make ?? null,
    vehicle_model: optionalString(vehicleSnapshot.model) ?? rawVehicle?.model ?? null,
    vehicle_trim: optionalString(vehicleSnapshot.trim) ?? rawVehicle?.trim ?? null,
    vehicle_engine: optionalString(vehicleSnapshot.engine) ?? specs?.engine ?? optionalString(object(rawVehicle?.metadata).engine),
    license_plate: optionalString(vehicleSnapshot.license_plate) ?? rawVehicle?.license_plate ?? null,
    odometer_measure: metadata.odometer_measure ? String(metadata.odometer_measure) : rawVehicle?.mileage_unit ?? "mi",
  };

  let oilType: string | null = metadata.oil_type ? String(metadata.oil_type) : null;
  if (!oilType && partsUsed) {
    const match = partsUsed.match(/Oil:\s*[\d.]+\s*qt\s+(.+)/i);
    if (match) oilType = match[1].trim();
  }
  if (!oilType) oilType = specs?.oil_type ?? null;

  const timeline: ServiceDetailTimelineEvent[] = [
    { id: `${row.id}-created`, status: "created", timestamp: row.created_at, notes: null },
    ...(row.started_at ? [{ id: `${row.id}-started`, status: "in_progress", timestamp: row.started_at, notes: null }] : []),
    ...(row.completed_at ? [{ id: `${row.id}-completed`, status: "completed", timestamp: row.completed_at, notes: row.internal_notes ?? null }] : []),
  ];

  return {
    service,
    customer,
    vehicle,
    laborItems,
    timeline,
    businessName: workspaceRes.data?.name || "",
    businessEmail: settingsRes.data?.email || "",
    guestInfo,
    catalogDescription,
    catalogLaborHours,
    oilType,
  };
}
