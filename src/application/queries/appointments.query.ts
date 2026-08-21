import { supabase } from "@/integrations/supabase/client";
import type { Appointment, BusinessHours, Customer, ServiceCatalogItem, Vehicle } from "@/shared/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface AppointmentWithSource extends Appointment {
  source?: "manual" | "online_booking" | "ai_intake" | string;
  intake_responses?: Record<string, unknown> | null;
}

export interface AppointmentsPageErrors {
  appointments?: string;
  customers?: string;
  vehicles?: string;
  catalog?: string;
}

export interface AppointmentScheduleVan {
  id: string;
  name: string;
}

export interface AppointmentsPageData {
  userId: string;
  appointments: AppointmentWithSource[];
  customers: Customer[];
  vehicles: Vehicle[];
  serviceCatalog: ServiceCatalogItem[];
  scheduleVans: AppointmentScheduleVan[];
  businessHours: BusinessHours;
  errors: AppointmentsPageErrors;
  providerName: string;
  providerEmail: string | null;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  opening_time: "08:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  slot_duration_minutes: 30,
  min_lead_time_hours: 0,
  buffer_time_before: 0,
  buffer_time_after: 0,
};

/**
 * Fetch all data needed for the main Appointments page.
 * Centralizes Supabase access and returns aggregated results + per-section errors.
 */
export async function fetchAppointmentsPageData(): Promise<AppointmentsPageData> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to manage appointments.");
  }

  const [appointmentsRes, customersRes, vehiclesRes, catalogRes, vansRes, profileRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("*, customer:customers(*), vehicle:vehicles(*), service_catalog:service_catalog(*), appointment_services(id, name, price, quantity)")
      .neq("source", "fleet_work_order"),
    supabase.from("customers").select("*"),
    supabase.from("vehicles").select("*"),
    supabase.from("service_catalog").select("*"),
    supabase.from("vans").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
    supabase.from("business_profiles").select("*").maybeSingle(),
  ]);

  const errors: AppointmentsPageErrors = {};

  if (appointmentsRes.error) {
    console.error("[fetchAppointmentsPageData] appointments error", appointmentsRes.error);
    errors.appointments = appointmentsRes.error.message || "Failed to load appointments";
  }

  if (customersRes.error) {
    console.error("[fetchAppointmentsPageData] customers error", customersRes.error);
    errors.customers = customersRes.error.message || "Failed to load customers";
  }

  if (vehiclesRes.error) {
    console.error("[fetchAppointmentsPageData] vehicles error", vehiclesRes.error);
    errors.vehicles = vehiclesRes.error.message || "Failed to load vehicles";
  }

  if (catalogRes.error) {
    console.error("[fetchAppointmentsPageData] service catalog error", catalogRes.error);
    errors.catalog = catalogRes.error.message || "Failed to load service catalog";
  }

  if (vansRes.error) {
    console.error("[fetchAppointmentsPageData] vans error", vansRes.error);
  }

  const appointments = ((appointmentsRes.data ?? []) as unknown as AppointmentWithSource[]).filter((appointment) => {
    if (appointment.source === "fleet_work_order") return false;
    const responses = appointment.intake_responses;
    if (responses && typeof responses === "object" && "fleet_work_order_id" in responses) return false;
    return true;
  });
  const customers = (customersRes.data ?? []) as Customer[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const serviceCatalog = (catalogRes.data ?? []) as unknown as ServiceCatalogItem[];
  const scheduleVans = (vansRes.data ?? []) as AppointmentScheduleVan[];

  const profile = profileRes.data as
    | (BusinessHours & {
        working_days?: string[];
        business_name?: string | null;
        email?: string | null;
      })
    | null
    | undefined;

  const profileAny = profile as unknown as Record<string, unknown> | null | undefined;
  const businessHours: BusinessHours = profile
    ? {
        opening_time:
          profile.opening_time || DEFAULT_BUSINESS_HOURS.opening_time,
        closing_time:
          profile.closing_time || DEFAULT_BUSINESS_HOURS.closing_time,
        working_days:
          profile.working_days || DEFAULT_BUSINESS_HOURS.working_days,
        slot_duration_minutes:
          (profileAny?.slot_duration_minutes as number | null) ?? DEFAULT_BUSINESS_HOURS.slot_duration_minutes,
        min_lead_time_hours:
          (profileAny?.min_lead_time_hours as number | null) ?? DEFAULT_BUSINESS_HOURS.min_lead_time_hours,
        buffer_time_before:
          (profileAny?.buffer_time_before as number | null) ?? DEFAULT_BUSINESS_HOURS.buffer_time_before,
        buffer_time_after:
          (profileAny?.buffer_time_after as number | null) ?? DEFAULT_BUSINESS_HOURS.buffer_time_after,
      }
    : DEFAULT_BUSINESS_HOURS;

  const providerName = profile?.business_name || "Auto Shop";
  const providerEmail = profile?.email ?? null;

  return {
    userId: user.id,
    appointments,
    customers,
    vehicles,
    serviceCatalog,
    scheduleVans,
    businessHours,
    errors,
    providerName,
    providerEmail,
  };
}

// ─────────────────────────────────────────────────────────────
// AppointmentPicker helpers (used by expense linking UI)
// ─────────────────────────────────────────────────────────────
export interface AppointmentPickerOption {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  customer_name: string | null;
}

export async function fetchAppointmentPickerOption(
  appointmentId: string,
): Promise<AppointmentPickerOption | null> {
  const { data } = await supabase
    .from("appointments")
    .select("id, title, status, scheduled_date, scheduled_time, customers(name)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string; title: string | null; status: string | null;
    scheduled_date: string | null; scheduled_time: string | null;
    customers: { name: string | null } | null;
  };
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    customer_name: row.customers?.name ?? null,
  };
}

export async function searchAppointmentPickerOptions(params: {
  userId: string;
  status: string; // "all" or specific status
  query: string;
  limit?: number;
}): Promise<AppointmentPickerOption[]> {
  const { userId, status, query, limit = 40 } = params;
  const q = query.trim();

  const buildBase = () => {
    let qb = supabase
      .from("appointments")
      .select("id, title, status, scheduled_date, scheduled_time, customer_id, customers(name)")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: false })
      .limit(limit);
    if (status !== "all") qb = qb.eq("status", status);
    return qb;
  };

  type Row = {
    id: string; title: string | null; status: string | null;
    scheduled_date: string | null; scheduled_time: string | null;
    customer_id: string | null;
    customers: { name: string | null } | null;
  };

  let titleMatches: Row[] = [];
  let customerMatches: Row[] = [];

  if (q.length >= 2) {
    const escaped = q.replace(/[%,]/g, "");
    const titleRes = await buildBase().ilike("title", `%${escaped}%`);
    titleMatches = (titleRes.data as unknown as Row[] | null) ?? [];

    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", `%${escaped}%`)
      .limit(50);
    const customerIds = ((matchedCustomers ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (customerIds.length > 0) {
      const custRes = await buildBase().in("customer_id", customerIds);
      customerMatches = (custRes.data as unknown as Row[] | null) ?? [];
    }
  } else {
    const recentRes = await buildBase();
    titleMatches = (recentRes.data as unknown as Row[] | null) ?? [];
  }

  const seen = new Set<string>();
  const merged = [...titleMatches, ...customerMatches].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return merged.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    scheduled_date: d.scheduled_date,
    scheduled_time: d.scheduled_time,
    customer_name: d.customers?.name ?? null,
  }));
}

/**
 * Read the status of a review request tied to a given service record, scoped
 * to the caller's user id. Returns `null` when no request exists yet.
 */
export async function fetchReviewRequestStatusForService(
  serviceRecordId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("review_requests")
    .select("status")
    .eq("service_id", serviceRecordId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.status as string | undefined) ?? null;
}

