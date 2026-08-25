/** Dashboard query adapters for Final's canonical workspace schema. */
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface DashboardStats {
  vehicles: number;
  pendingServices: number;
  lowStockItems: number;
}

export interface ActiveService {
  id: string;
  vehicle: string;
  customer: string;
  serviceType: string;
}

export interface UpcomingAppointment {
  id: string;
  title: string;
  date: Date;
  time?: string;
  vehicle?: string;
  status: "confirmed" | "pending";
}

export interface PreviousPeriodPayment {
  id: string;
  amount: number;
  status: string;
  refund_amount?: number;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  created_at: string;
  status: string;
  customer_email?: string;
  customer_name?: string;
  refund_amount?: number;
}

export interface ServiceRecord {
  id: string;
  service_type: string;
  payment_status: string | null;
  total_cost: number;
  tax_amount?: number | null;
  discount_amount?: number | null;
  shop_supplies?: number | null;
  paid_amount?: number | null;
  service_date: string;
  status: string;
  customer?: { name: string } | null;
  vehicle?: { make: string; model: string; year: number } | null;
}

export interface AppointmentRecord {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  guest_name?: string;
  guest_email?: string;
  estimated_cost?: number;
}

export interface DashboardOverviewResult {
  stats: DashboardStats;
  activeServices: ActiveService[];
  upcomingAppointments: UpcomingAppointment[];
}

export interface DashboardDateRange {
  from: Date;
  to: Date;
}

export interface DashboardReportingResult {
  payments: PaymentRecord[];
  services: ServiceRecord[];
  appointments: AppointmentRecord[];
  previousPeriodPayments: PreviousPeriodPayment[];
}

export interface DashboardOnboardingInfo {
  hasUser: boolean;
  onboardingCompleted: boolean;
  ownerName: string | null;
  resolved: boolean;
}

function obj(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function customerName(value: any): string {
  if (!value) return "Customer";
  return [value.first_name, value.last_name].filter(Boolean).join(" ").trim() || "Customer";
}

function appointmentTitle(row: any): string {
  const metadata = obj(row.metadata);
  return String(metadata.title ?? metadata.service_name ?? "Appointment");
}

function appointmentLegacy(row: any): AppointmentRecord {
  const metadata = obj(row.metadata);
  const startsAt = new Date(row.starts_at);
  return {
    id: row.id,
    title: appointmentTitle(row),
    scheduled_date: format(startsAt, "yyyy-MM-dd"),
    scheduled_time: format(startsAt, "HH:mm"),
    status: row.status,
    guest_name: metadata.guest_name ?? undefined,
    guest_email: metadata.guest_email ?? undefined,
    estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : undefined,
  };
}

function serviceLegacy(row: any): ServiceRecord {
  const metadata = obj(row.metadata);
  const when = row.completed_at ?? row.started_at ?? row.created_at;
  return {
    id: row.id,
    service_type: String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service"),
    payment_status: metadata.payment_status ?? null,
    total_cost: Number(row.total_amount ?? 0),
    tax_amount: row.tax_amount != null ? Number(row.tax_amount) : null,
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : null,
    shop_supplies: metadata.shop_supplies != null ? Number(metadata.shop_supplies) : null,
    paid_amount: metadata.paid_amount != null ? Number(metadata.paid_amount) : null,
    service_date: format(new Date(when), "yyyy-MM-dd"),
    status: row.status,
    customer: row.customers ? { name: customerName(row.customers) } : null,
    vehicle: row.vehicles ? {
      make: row.vehicles.make ?? "",
      model: row.vehicles.model ?? "",
      year: Number(row.vehicles.year ?? 0),
    } : null,
  };
}

export async function fetchDashboardOnboardingInfo(): Promise<DashboardOnboardingInfo> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { hasUser: false, onboardingCompleted: false, ownerName: null, resolved: true };
  }

  try {
    const context = await resolveCurrentWorkspace();
    if (!context) {
      return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: true };
    }
    const { data, error } = await (supabase.from("workspace_settings") as any)
      .select("owner_name")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return {
      hasUser: true,
      onboardingCompleted: true,
      ownerName: data?.owner_name ?? null,
      resolved: true,
    };
  } catch {
    return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: false };
  }
}

export async function fetchDashboardOverview(): Promise<DashboardOverviewResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) {
    return { stats: { vehicles: 0, pendingServices: 0, lowStockItems: 0 }, activeServices: [], upcomingAppointments: [] };
  }

  const nowIso = new Date().toISOString();
  const [vehiclesRes, pendingRes, activeRes, upcomingRes] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("status", "active"),
    supabase.from("service_records").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("status", "in_progress"),
    (supabase.from("service_records") as any)
      .select("id,work_performed,metadata,customers(first_name,last_name),vehicles(year,make,model)")
      .eq("workspace_id", context.workspaceId)
      .eq("status", "in_progress")
      .limit(5),
    (supabase.from("appointments") as any)
      .select("id,status,starts_at,metadata,vehicles(year,make,model)")
      .eq("workspace_id", context.workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", nowIso)
      .in("status", ["confirmed", "pending"])
      .order("starts_at", { ascending: true })
      .limit(5),
  ]);

  if (vehiclesRes.error) throw vehiclesRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (activeRes.error) throw activeRes.error;
  if (upcomingRes.error) throw upcomingRes.error;

  const activeServices: ActiveService[] = ((activeRes.data ?? []) as any[]).map((row) => ({
    id: row.id,
    vehicle: row.vehicles ? `${row.vehicles.year ?? ""} ${row.vehicles.make ?? ""} ${row.vehicles.model ?? ""}`.trim() : "Unknown",
    customer: customerName(row.customers),
    serviceType: String(obj(row.metadata).service_type ?? obj(row.metadata).title ?? row.work_performed ?? "Service"),
  }));

  const upcomingAppointments: UpcomingAppointment[] = ((upcomingRes.data ?? []) as any[]).map((row) => {
    const startsAt = new Date(row.starts_at);
    return {
      id: row.id,
      title: appointmentTitle(row),
      date: startsAt,
      time: format(startsAt, "HH:mm"),
      vehicle: row.vehicles ? `${row.vehicles.year ?? ""} ${row.vehicles.make ?? ""} ${row.vehicles.model ?? ""}`.trim() : undefined,
      status: row.status as "confirmed" | "pending",
    };
  });

  return {
    stats: {
      vehicles: vehiclesRes.count ?? 0,
      pendingServices: pendingRes.count ?? 0,
      // Final does not yet have an inventory_items table. Do not fabricate stock counts.
      lowStockItems: 0,
    },
    activeServices,
    upcomingAppointments,
  };
}

export async function fetchDashboardReporting(range: DashboardDateRange): Promise<DashboardReportingResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { payments: [], services: [], appointments: [], previousPeriodPayments: [] };

  const fromIso = new Date(range.from); fromIso.setHours(0, 0, 0, 0);
  const toIso = new Date(range.to); toIso.setHours(23, 59, 59, 999);
  const periodDays = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000));
  const prevFrom = subDays(range.from, periodDays); prevFrom.setHours(0, 0, 0, 0);
  const prevTo = subDays(range.from, 1); prevTo.setHours(23, 59, 59, 999);

  const [paymentsRes, servicesRes, appointmentsRes, prevPaymentsRes] = await Promise.all([
    (supabase.from("payments") as any)
      .select("id,amount,created_at,status,metadata,customers(first_name,last_name,email),appointments(status)")
      .eq("workspace_id", context.workspaceId)
      .gte("created_at", fromIso.toISOString())
      .lte("created_at", toIso.toISOString())
      .order("created_at", { ascending: true }),
    (supabase.from("service_records") as any)
      .select("id,status,work_performed,metadata,started_at,completed_at,created_at,total_amount,tax_amount,discount_amount,customers(first_name,last_name),vehicles(make,model,year)")
      .eq("workspace_id", context.workspaceId)
      .gte("created_at", fromIso.toISOString())
      .lte("created_at", toIso.toISOString())
      .order("created_at", { ascending: true }),
    (supabase.from("appointments") as any)
      .select("id,status,starts_at,metadata")
      .eq("workspace_id", context.workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", fromIso.toISOString())
      .lte("starts_at", toIso.toISOString())
      .order("starts_at", { ascending: true }),
    (supabase.from("payments") as any)
      .select("id,amount,status,metadata")
      .eq("workspace_id", context.workspaceId)
      .gte("created_at", prevFrom.toISOString())
      .lte("created_at", prevTo.toISOString()),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (servicesRes.error) throw servicesRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;
  if (prevPaymentsRes.error) throw prevPaymentsRes.error;

  const payments: PaymentRecord[] = ((paymentsRes.data ?? []) as any[])
    .filter((row) => {
      const metadata = obj(row.metadata);
      const appointmentStatus = row.appointments?.status ?? metadata.appointment_status;
      return !(row.status === "pending" && appointmentStatus === "cancelled");
    })
    .map((row) => {
      const metadata = obj(row.metadata);
      return {
        id: row.id,
        amount: Number(row.amount ?? 0),
        created_at: row.created_at,
        status: row.status,
        customer_email: row.customers?.email ?? row.customer_email ?? metadata.customer_email ?? undefined,
        customer_name: row.customers ? customerName(row.customers) : row.customer_name ?? metadata.customer_name ?? undefined,
        refund_amount:
          row.status === "refunded"
            ? Number(row.amount ?? 0)
            : Number(row.refund_amount ?? metadata.refunded_amount ?? 0) || undefined,
      };
    });

  const previousPeriodPayments: PreviousPeriodPayment[] = ((prevPaymentsRes.data ?? []) as any[]).map((row) => ({
    id: row.id,
    amount: Number(row.amount ?? 0),
    status: row.status,
    refund_amount: row.status === "refunded" ? Number(row.amount ?? 0) : Number(obj(row.metadata).refunded_amount ?? 0) || undefined,
  }));

  return {
    payments,
    services: ((servicesRes.data ?? []) as any[]).map(serviceLegacy),
    appointments: ((appointmentsRes.data ?? []) as any[]).map(appointmentLegacy),
    previousPeriodPayments,
  };
}
