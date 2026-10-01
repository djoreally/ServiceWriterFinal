/** Dashboard query adapters for Final's canonical workspace schema. */
import { apiClient } from "@/lib/api-client";
import { format, subDays, startOfDay } from "date-fns";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

interface DashboardCustomerSource {
  first_name?: string | null;
  last_name?: string | null;
}

interface DashboardAppointmentSource {
  id: string;
  status: string;
  starts_at: string;
  metadata?: unknown;
}

interface DashboardServiceSource {
  id: string;
  status: string;
  work_performed?: string | null;
  metadata?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  total_amount?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  customers?: DashboardCustomerSource | null;
  vehicles?: { make?: string | null; model?: string | null; year?: number | null } | null;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function customerName(value: DashboardCustomerSource | null | undefined): string {
  if (!value) return "Customer";
  return [value.first_name, value.last_name].filter(Boolean).join(" ").trim() || "Customer";
}

function appointmentTitle(row: Pick<DashboardAppointmentSource, "metadata">): string {
  const metadata = obj(row.metadata);
  return String(metadata.title ?? metadata.service_name ?? "Appointment");
}

function appointmentLegacy(row: DashboardAppointmentSource): AppointmentRecord {
  const metadata = obj(row.metadata);
  const startsAt = new Date(row.starts_at);
  return {
    id: row.id,
    title: appointmentTitle(row),
    scheduled_date: format(startsAt, "yyyy-MM-dd"),
    scheduled_time: format(startsAt, "HH:mm"),
    status: row.status,
    guest_name: typeof metadata.guest_name === "string" ? metadata.guest_name : undefined,
    guest_email: typeof metadata.guest_email === "string" ? metadata.guest_email : undefined,
    estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : undefined,
  };
}

function serviceLegacy(row: DashboardServiceSource): ServiceRecord {
  const metadata = obj(row.metadata);
  const when = row.completed_at ?? row.started_at ?? row.created_at;
  return {
    id: row.id,
    service_type: String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service"),
    payment_status: typeof metadata.payment_status === "string" ? metadata.payment_status : null,
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
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { hasUser: false, onboardingCompleted: false, ownerName: null, resolved: true };
  }

  try {
    const context = await resolveCurrentWorkspace();
    if (!context) {
      return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: true };
    }
    const info = await apiClient.get<DashboardOnboardingInfo>(
      "/v1/platform/dashboard/onboarding-info",
      { query: { selected_workspace_id: context.workspaceId } },
    );
    return { ...info, hasUser: true };
  } catch {
    return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: false };
  }
}

export async function fetchDashboardOverview(): Promise<DashboardOverviewResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) {
    return { stats: { vehicles: 0, pendingServices: 0, lowStockItems: 0 }, activeServices: [], upcomingAppointments: [] };
  }

  const todayStartIso = format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm:ss");
  const rows = await apiClient.get<{
    vehiclesCount: number;
    pendingCount: number;
    activeRows: any[];
    upcomingRows: any[];
  }>("/v1/platform/dashboard/overview", {
    query: { selected_workspace_id: context.workspaceId, today_start: todayStartIso },
  });

  const activeServices: ActiveService[] = (rows.activeRows ?? []).map((row) => ({
    id: row.id,
    vehicle: row.vehicles ? `${row.vehicles.year ?? ""} ${row.vehicles.make ?? ""} ${row.vehicles.model ?? ""}`.trim() : "Unknown",
    customer: customerName(row.customers),
    serviceType: String(obj(row.metadata).service_type ?? obj(row.metadata).title ?? row.work_performed ?? "Service"),
  }));

  const upcomingAppointments: UpcomingAppointment[] = (rows.upcomingRows ?? []).map((row) => {
    const startsAt = new Date(row.starts_at);
    return {
      id: row.id,
      title: appointmentTitle(row),
      date: startsAt,
      time: format(startsAt, "HH:mm"),
      vehicle: row.vehicles ? `${row.vehicles.year ?? ""} ${row.vehicles.make ?? ""} ${row.vehicles.model ?? ""}`.trim() : undefined,
      status: row.status === "confirmed" ? "confirmed" : "pending",
    };
  });

  return {
    stats: {
      vehicles: rows.vehiclesCount ?? 0,
      pendingServices: rows.pendingCount ?? 0,
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

  const rows = await apiClient.get<{
    paymentRows: any[];
    serviceRows: any[];
    appointmentRows: any[];
    prevPaymentRows: any[];
  }>("/v1/platform/dashboard/reporting", {
    query: {
      selected_workspace_id: context.workspaceId,
      from: fromIso.toISOString(),
      to: toIso.toISOString(),
      prev_from: prevFrom.toISOString(),
      prev_to: prevTo.toISOString(),
    },
  });

  const payments: PaymentRecord[] = (rows.paymentRows ?? [])
    .filter((row) => {
      const metadata = obj(row.metadata);
      const appointmentStatus = metadata.appointment_status;
      return !(row.status === "pending" && appointmentStatus === "cancelled");
    })
    .map((row) => {
      const metadata = obj(row.metadata);
      return {
        id: row.id,
        amount: Number(row.amount ?? 0),
        created_at: row.created_at,
        status: row.status,
        customer_email:
          row.customers?.email ??
          (typeof metadata.customer_email === "string" ? metadata.customer_email : undefined),
        customer_name:
          row.customers
            ? customerName(row.customers)
            : typeof metadata.customer_name === "string"
              ? metadata.customer_name
              : undefined,
        refund_amount:
          row.status === "refunded"
            ? Number(row.amount ?? 0)
            : Number(metadata.refunded_amount ?? 0) || undefined,
      };
    });

  const previousPeriodPayments: PreviousPeriodPayment[] = (rows.prevPaymentRows ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount ?? 0),
    status: row.status,
    refund_amount: row.status === "refunded" ? Number(row.amount ?? 0) : Number(obj(row.metadata).refunded_amount ?? 0) || undefined,
  }));

  return {
    payments,
    services: (rows.serviceRows ?? []).map(serviceLegacy),
    appointments: (rows.appointmentRows ?? []).map(appointmentLegacy),
    previousPeriodPayments,
  };
}
