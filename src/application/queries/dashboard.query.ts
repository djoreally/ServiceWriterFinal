/**
 * Dashboard Queries - Read operations for owner dashboard views
 *
 * All Supabase access for the dashboard page lives here so that
 * UI components don't talk to Supabase directly.
 */

import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, subDays } from "date-fns";

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
  /**
   * True only when we definitively resolved the profile (found, or confirmed
   * none exists). When false, the caller MUST NOT use `onboardingCompleted`
   * to redirect — a transient RLS / network blip should never force an
   * already-onboarded user back into onboarding.
   */
  resolved: boolean;
}

/**
 * Check onboarding status and fetch owner name for greeting.
 */
export async function fetchDashboardOnboardingInfo(): Promise<DashboardOnboardingInfo> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    return { hasUser: false, onboardingCompleted: false, ownerName: null, resolved: true };
  }

  // Team members (manager/dispatcher/technician) work inside an owner's tenant
  // and must never be sent through onboarding. Resolve their owner's profile instead.
  const { data: link, error: linkError } = await supabase
    .from("team_user_links")
    .select("owner_user_id")
    .eq("member_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (linkError) {
    return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: false };
  }

  if (link?.owner_user_id) {
    const { data: ownerProfile } = await supabase
      .from("business_profiles")
      .select("owner_name")
      .eq("user_id", link.owner_user_id)
      .maybeSingle();

    return {
      hasUser: true,
      onboardingCompleted: true,
      ownerName: ownerProfile?.owner_name ?? null,
      resolved: true,
    };
  }

  const { data: profile, error } = await supabase
    .from("business_profiles")
    .select("onboarding_completed, owner_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Real query error — keep caller from forcing an onboarded user to /onboarding.
    return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: false };
  }

  if (!profile) {
    // Genuinely no row yet — brand-new account, needs onboarding.
    return { hasUser: true, onboardingCompleted: false, ownerName: null, resolved: true };
  }

  return {
    hasUser: true,
    onboardingCompleted: Boolean(profile.onboarding_completed),
    ownerName: profile.owner_name ?? null,
    resolved: true,
  };
}

/**
 * Fetch high-level dashboard stats and active/upcoming items.
 */
export async function fetchDashboardOverview(): Promise<DashboardOverviewResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) {
    return {
      stats: { vehicles: 0, pendingServices: 0, lowStockItems: 0 },
      activeServices: [],
      upcomingAppointments: [],
    };
  }

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  const [vehiclesRes, pendingServicesRes, lowStockRes, activeServicesRes, upcomingRes] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    supabase.from("inventory_items").select("id", { count: "exact", head: true }).lt("quantity", 5),
    supabase
      .from("services")
      // Use explicit FK constraint name to disambiguate (two FKs exist on customer_id)
      .select(`id, service_type, customer:customers!fk_services_customer(name), vehicle:vehicles(make, model, year)`)
      .eq("status", "in_progress")
      .limit(5),
    supabase
      .from("appointments")
      .select(`id, title, scheduled_date, scheduled_time, status, vehicle:vehicles(make, model, year)`)
      .neq("source", "fleet_work_order")
      .gte("scheduled_date", today)
      .in("status", ["confirmed", "pending"])
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(25),
  ]);

  const stats: DashboardStats = {
    vehicles: vehiclesRes.count || 0,
    pendingServices: pendingServicesRes.count || 0,
    lowStockItems: lowStockRes.count || 0,
  };

  let activeServices: ActiveService[] = [];
  if (activeServicesRes.data) {
    const activeServicesData = activeServicesRes.data as unknown as Array<{
      id: string;
      service_type: string;
      customer?: { name: string } | null;
      vehicle?: { year: number; make: string; model: string } | null;
    }>;

    activeServices = activeServicesData.map((s) => ({
      id: s.id,
      vehicle: s.vehicle ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}` : "Unknown",
      customer: s.customer?.name || "Customer",
      serviceType: s.service_type,
    }));
  }

  let upcomingAppointments: UpcomingAppointment[] = [];
  if (upcomingRes.data) {
    upcomingAppointments = upcomingRes.data
      .map((a: any) => {
        const startsAt = parseISO(`${a.scheduled_date}T${a.scheduled_time || "00:00"}`);
        return {
          id: a.id,
          title: a.title,
          date: parseISO(a.scheduled_date),
          time: a.scheduled_time,
          vehicle: a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : undefined,
          status: a.status as "confirmed" | "pending",
          startsAt,
        };
      })
      .filter((a) => !Number.isNaN(a.startsAt.getTime()) && a.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 5)
      .map(({ startsAt, ...appointment }) => appointment);
  }

  return { stats, activeServices, upcomingAppointments };
}

/**
 * Fetch reporting data for charts and metrics.
 */
export async function fetchDashboardReporting(
  range: DashboardDateRange
): Promise<DashboardReportingResult> {
  const fromDate = format(range.from, "yyyy-MM-dd");
  const toDate = format(range.to, "yyyy-MM-dd");

  // Calculate previous period
  const periodDays = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24));
  const prevFrom = format(subDays(range.from, periodDays), "yyyy-MM-dd");
  const prevTo = format(subDays(range.from, 1), "yyyy-MM-dd");

  const [paymentsRes, servicesRes, appointmentsRes, prevPaymentsRes] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, created_at, status, customer_email, customer_name, refund_amount, appointment_id, appointments(status)"
      )
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59`)
      .order("created_at", { ascending: true }),
    supabase
      .from("services")
      .select(
        `
            id, service_type, payment_status, total_cost, tax_amount, discount_amount, shop_supplies, paid_amount, service_date, status,
            customer:customers!fk_services_customer(name),
            vehicle:vehicles(make, model, year)
          `
      )
      .gte("service_date", fromDate)
      .lte("service_date", toDate)
      .order("service_date", { ascending: true }),
    supabase
      .from("appointments")
      .select("id, title, scheduled_date, scheduled_time, status, guest_name, guest_email, estimated_cost")
      .neq("source", "fleet_work_order")
      .gte("scheduled_date", fromDate)
      .lte("scheduled_date", toDate)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount, status, refund_amount")
      .gte("created_at", `${prevFrom}T00:00:00`)
      .lte("created_at", `${prevTo}T23:59:59`),
  ]);

  // Log any query errors for debugging
  if (servicesRes.error) console.error("Dashboard services query error:", servicesRes.error);
  if (paymentsRes.error) console.error("Dashboard payments query error:", paymentsRes.error);
  if (appointmentsRes.error) console.error("Dashboard appointments query error:", appointmentsRes.error);

  const rawPayments = (paymentsRes.data || []) as any[];
  const cleanPayments: PaymentRecord[] = rawPayments
    .filter((p) => !(p.status === "pending" && p.appointments?.status === "cancelled"))
    .map((p) => ({
      id: p.id,
      amount: p.amount,
      created_at: p.created_at,
      status: p.status,
      customer_email: p.customer_email ?? undefined,
      customer_name: p.customer_name ?? undefined,
      refund_amount: p.refund_amount ?? undefined,
    }));

  const services = ((servicesRes.data || []) as unknown) as ServiceRecord[];
  const appointments = (appointmentsRes.data || []) as AppointmentRecord[];
  const previousPeriodPayments = (prevPaymentsRes.data || []) as PreviousPeriodPayment[];

  return {
    payments: cleanPayments,
    services,
    appointments,
    previousPeriodPayments,
  };
}
