/**
 * Reports Tabs Query — supporting live data for the Reports page tabs that
 * previously rendered static placeholders.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CustomerAnalyticsRow {
  id: string;
  name: string;
  email: string | null;
  lifetime_value: number;
  total_services: number;
  average_order_value: number;
  days_since_last_service: number | null;
  churn_risk: string | null;
  customer_segment: string | null;
  last_service_date: string | null;
  first_service_date: string | null;
}

export interface CustomerAnalytics {
  customers: CustomerAnalyticsRow[];
  totalLifetimeValue: number;
  repeat: number;
  oneTime: number;
  dueForService: CustomerAnalyticsRow[];
  churnRisk: CustomerAnalyticsRow[];
  topByValue: CustomerAnalyticsRow[];
}

/** Customer cohorts: value, repeat behaviour, churn risk, due for service. */
export async function fetchCustomerAnalytics(userId: string): Promise<CustomerAnalytics> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, email, lifetime_value, total_services, average_order_value, days_since_last_service, churn_risk, customer_segment, last_service_date, first_service_date",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("lifetime_value", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const customers = (data ?? []).map((row: any) => ({
    ...row,
    lifetime_value: Number(row.lifetime_value) || 0,
    total_services: Number(row.total_services) || 0,
    average_order_value: Number(row.average_order_value) || 0,
    days_since_last_service: row.days_since_last_service != null ? Number(row.days_since_last_service) : null,
  })) as CustomerAnalyticsRow[];

  return {
    customers,
    totalLifetimeValue: customers.reduce((sum, row) => sum + row.lifetime_value, 0),
    repeat: customers.filter((row) => row.total_services >= 2).length,
    oneTime: customers.filter((row) => row.total_services === 1).length,
    dueForService: customers
      .filter((row) => (row.days_since_last_service ?? 0) >= 90)
      .sort((a, b) => (b.days_since_last_service ?? 0) - (a.days_since_last_service ?? 0))
      .slice(0, 10),
    churnRisk: customers.filter((row) => ["high", "medium"].includes(String(row.churn_risk || "").toLowerCase())).slice(0, 10),
    topByValue: customers.slice(0, 10),
  };
}

export interface TechnicianRef {
  id: string;
  name: string;
  status: string | null;
}

/** Active technicians used to label operational throughput. */
export async function fetchTechniciansForReports(userId: string): Promise<TechnicianRef[]> {
  const { data, error } = await supabase
    .from("technicians")
    .select("id, name, status")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as TechnicianRef[];
}

export interface MarketingAttributionRow {
  source: string;
  bookings: number;
  billed: number;
}

/** Earliest activity date across appointments and services (for the All-time range). */
export async function fetchEarliestActivityDate(): Promise<Date | null> {
  const [apptRes, serviceRes] = await Promise.all([
    supabase.from("appointments").select("scheduled_date").order("scheduled_date", { ascending: true }).limit(1),
    supabase.from("services").select("service_date").order("service_date", { ascending: true }).limit(1),
  ]);
  const candidates = [apptRes.data?.[0]?.scheduled_date, serviceRes.data?.[0]?.service_date]
    .filter(Boolean)
    .map((value) => new Date(`${value}T00:00:00`));
  if (!candidates.length) return null;
  return candidates.reduce((earliest, current) => (current < earliest ? current : earliest));
}
