/** Reports Query — compatibility adapters over Final's canonical schema. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export type QueryResult<T> = { data: T | null; error: unknown };

function obj(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function context() {
  const resolved = await resolveCurrentWorkspace();
  if (!resolved) throw new Error("Select a workspace before viewing reports.");
  return resolved;
}

async function result<T>(work: () => Promise<T>): Promise<QueryResult<T>> {
  try {
    return { data: await work(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function name(customer: any): string {
  if (!customer) return "";
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
}

function appointmentRow(row: any) {
  const metadata = obj(row.metadata);
  const starts = new Date(row.starts_at);
  const ends = new Date(row.ends_at);
  const duration = Number.isFinite(starts.getTime()) && Number.isFinite(ends.getTime())
    ? Math.max(0, Math.round((ends.getTime() - starts.getTime()) / 60_000))
    : null;
  return {
    id: row.id,
    title: String(metadata.title ?? metadata.service_name ?? "Appointment"),
    scheduled_date: row.starts_at?.slice(0, 10) ?? "",
    scheduled_time: row.starts_at?.slice(11, 16) ?? "",
    duration_minutes: duration,
    status: row.status,
    guest_name: metadata.guest_name ?? undefined,
    guest_email: metadata.guest_email ?? undefined,
    estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : undefined,
    tax_amount: metadata.tax_amount != null ? Number(metadata.tax_amount) : undefined,
    customer_id: row.customer_id ?? null,
    customer_postal_code: metadata.customer_postal_code ?? row.customers?.postal_code ?? null,
    location_address: metadata.location_address ?? null,
    travel_time_minutes: metadata.travel_time_minutes != null ? Number(metadata.travel_time_minutes) : null,
    actual_start_time: metadata.actual_start_time ?? null,
    actual_end_time: metadata.actual_end_time ?? null,
    assigned_technician_id: row.assigned_user_id ?? null,
    updated_at: row.updated_at ?? null,
    data_origin: metadata.data_origin ?? metadata.migration_source ?? "canonical",
    customer: row.customers ? { name: name(row.customers), postal_code: row.customers.postal_code ?? undefined } : null,
    vehicle: row.vehicles ? { make: row.vehicles.make ?? "", model: row.vehicles.model ?? "", year: Number(row.vehicles.year ?? 0) } : null,
  };
}

function serviceRow(row: any) {
  const metadata = obj(row.metadata);
  const date = row.completed_at ?? row.started_at ?? row.created_at;
  return {
    id: row.id,
    service_type: String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service"),
    total_cost: Number(row.total_amount ?? 0),
    tax_amount: row.tax_amount != null ? Number(row.tax_amount) : null,
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : null,
    shop_supplies: metadata.shop_supplies != null ? Number(metadata.shop_supplies) : null,
    paid_amount: metadata.paid_amount != null ? Number(metadata.paid_amount) : null,
    payment_status: metadata.payment_status ?? null,
    service_date: date?.slice(0, 10) ?? "",
    status: row.status,
    appointment_id: row.appointment_id ?? null,
    data_origin: metadata.data_origin ?? metadata.migration_source ?? "canonical",
    customer: row.customers ? { name: name(row.customers) } : null,
    vehicle: row.vehicles ? { make: row.vehicles.make ?? "", model: row.vehicles.model ?? "", year: Number(row.vehicles.year ?? 0) } : null,
  };
}

export async function fetchReportPayments(fromDate: string, toDate: string) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await (supabase.from("payments") as any)
      .select("id,amount,created_at,status,provider,metadata,customers(first_name,last_name,email),invoices(id,status)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => {
      const metadata = obj(row.metadata);
      return {
        id: row.id,
        amount: Number(row.amount ?? 0),
        created_at: row.created_at,
        status: row.status,
        customer_email: row.customers?.email ?? metadata.customer_email ?? undefined,
        customer_name: row.customers ? name(row.customers) : metadata.customer_name ?? undefined,
        refund_amount: row.status === "refunded" ? Number(row.amount ?? 0) : Number(metadata.refunded_amount ?? 0) || undefined,
        payment_type: String(metadata.payment_method ?? row.provider ?? "other"),
        tax_amount: metadata.tax_amount != null ? Number(metadata.tax_amount) : undefined,
        platform_fee: metadata.platform_fee != null ? Number(metadata.platform_fee) : undefined,
        subtotal: metadata.subtotal != null ? Number(metadata.subtotal) : undefined,
        metadata: row.metadata ?? {},
        appointment_id: metadata.appointment_id ?? null,
        data_origin: metadata.data_origin ?? metadata.migration_source ?? "canonical",
        appointments: null,
      };
    });
  });
}

export async function fetchReportServices(fromDate: string, toDate: string, limit?: number) {
  return result(async () => {
    const { workspaceId } = await context();
    let q = (supabase.from("service_records") as any)
      .select("id,appointment_id,status,work_performed,metadata,started_at,completed_at,created_at,total_amount,tax_amount,discount_amount,customers(first_name,last_name),vehicles(make,model,year)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59`)
      .order("created_at", { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as any[]).map(serviceRow);
  });
}

export async function fetchReportAppointments(fromDate: string, toDate: string, limit?: number) {
  return result(async () => {
    const { workspaceId } = await context();
    let q = (supabase.from("appointments") as any)
      .select("id,customer_id,assigned_user_id,status,starts_at,ends_at,source,metadata,updated_at,customers(first_name,last_name,postal_code),vehicles(make,model,year)")
      .eq("workspace_id", workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", `${fromDate}T00:00:00`)
      .lte("starts_at", `${toDate}T23:59:59`)
      .order("starts_at", { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as any[]).map(appointmentRow);
  });
}

export async function fetchReportCustomers(limit = 200) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await (supabase.from("customers") as any)
      .select("id,first_name,last_name,email,phone,metadata,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => {
      const metadata = obj(row.metadata);
      return {
        id: row.id,
        name: name(row),
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        lifetime_value: metadata.lifetime_value != null ? Number(metadata.lifetime_value) : undefined,
        total_services: metadata.total_services != null ? Number(metadata.total_services) : undefined,
        last_service_date: metadata.last_service_date ?? undefined,
        customer_segment: metadata.customer_segment ?? undefined,
        churn_risk: metadata.churn_risk ?? undefined,
        average_order_value: metadata.average_order_value != null ? Number(metadata.average_order_value) : undefined,
        first_service_date: metadata.first_service_date ?? undefined,
        visit_frequency_days: metadata.visit_frequency_days != null ? Number(metadata.visit_frequency_days) : undefined,
        days_since_last_service: metadata.days_since_last_service != null ? Number(metadata.days_since_last_service) : undefined,
        data_origin: metadata.data_origin ?? metadata.migration_source ?? "canonical",
      };
    });
  });
}

export async function fetchReportVehicles(limit = 500) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await (supabase.from("vehicles") as any)
      .select("id,year,make,model,vin,license_plate,mileage,metadata,updated_at,customers(first_name,last_name),vehicle_service_specs(engine,oil_type)")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => {
      const specs = Array.isArray(row.vehicle_service_specs) ? row.vehicle_service_specs[0] : row.vehicle_service_specs;
      const metadata = obj(row.metadata);
      return {
        id: row.id,
        year: Number(row.year ?? 0),
        make: row.make ?? "",
        model: row.model ?? "",
        vin: row.vin ?? undefined,
        license_plate: row.license_plate ?? undefined,
        oil_type: specs?.oil_type ?? undefined,
        mileage: row.mileage != null ? Number(row.mileage) : undefined,
        engine: specs?.engine ?? undefined,
        data_origin: metadata.data_origin ?? metadata.migration_source ?? "canonical",
        customer: row.customers ? { name: name(row.customers) } : null,
        updated_at: row.updated_at,
      };
    });
  });
}

export async function fetchPreviousPeriodPayments(prevFrom: string, prevTo: string) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await supabase.from("payments")
      .select("id,amount,status")
      .eq("workspace_id", workspaceId)
      .gte("created_at", `${prevFrom}T00:00:00`)
      .lte("created_at", `${prevTo}T23:59:59`);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: row.id, amount: Number(row.amount ?? 0), status: row.status }));
  });
}

export async function fetchYtdPayments(ytdFrom: string) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await supabase.from("payments")
      .select("amount,status")
      .eq("workspace_id", workspaceId)
      .gte("created_at", `${ytdFrom}T00:00:00`);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ amount: Number(row.amount ?? 0), status: row.status }));
  });
}

export async function fetchActiveTechnicians() {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await (supabase.from("workspace_members") as any)
      .select("user_id,role,is_active,profiles(display_name)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .eq("role", "technician");
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      id: row.user_id,
      name: row.profiles?.display_name ?? "Technician",
      status: "active",
      skills: [],
    }));
  });
}

export async function fetchTechnicianAppointmentsForPerformance(fromDate: string, toDate: string) {
  return result(async () => {
    const { workspaceId } = await context();
    const { data, error } = await (supabase.from("appointments") as any)
      .select("id,assigned_user_id,status,starts_at,ends_at,metadata")
      .eq("workspace_id", workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", `${fromDate}T00:00:00`)
      .lte("starts_at", `${toDate}T23:59:59`)
      .not("assigned_user_id", "is", null);
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => {
      const metadata = obj(row.metadata);
      const starts = new Date(row.starts_at);
      const ends = new Date(row.ends_at);
      return {
        id: row.id,
        assigned_technician_id: row.assigned_user_id,
        status: row.status,
        estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : null,
        estimated_duration_minutes: Number.isFinite(starts.getTime()) && Number.isFinite(ends.getTime()) ? Math.max(0, Math.round((ends.getTime() - starts.getTime()) / 60_000)) : null,
        actual_start_time: metadata.actual_start_time ?? null,
        actual_end_time: metadata.actual_end_time ?? null,
        scheduled_date: row.starts_at?.slice(0, 10) ?? "",
      };
    });
  });
}

export async function fetchRollingServices(geoFrom: string, toDate: string, limit = 2000) {
  return fetchReportServices(geoFrom, toDate, limit);
}

export async function fetchRollingAppointments(geoFrom: string, toDate: string, limit = 2000) {
  return fetchReportAppointments(geoFrom, toDate, limit);
}
