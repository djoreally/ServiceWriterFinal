/** Reports supporting queries backed by canonical workspace tables. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface CustomerAnalyticsRow { id: string; name: string; email: string | null; lifetime_value: number; total_services: number; average_order_value: number; days_since_last_service: number | null; churn_risk: string | null; customer_segment: string | null; last_service_date: string | null; first_service_date: string | null; }
export interface CustomerAnalytics { customers: CustomerAnalyticsRow[]; totalLifetimeValue: number; repeat: number; oneTime: number; dueForService: CustomerAnalyticsRow[]; churnRisk: CustomerAnalyticsRow[]; topByValue: CustomerAnalyticsRow[]; }

export async function fetchCustomerAnalytics(_userId: string): Promise<CustomerAnalytics> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const [customerResult, serviceResult] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,email,created_at").eq("workspace_id", context.workspaceId),
    db.from("service_records").select("customer_id,total_amount,status,started_at,completed_at,created_at").eq("workspace_id", context.workspaceId),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;

  const servicesByCustomer = new Map<string, Array<Record<string, any>>>();
  for (const row of serviceResult.data ?? []) {
    if (!row.customer_id) continue;
    const list = servicesByCustomer.get(row.customer_id) ?? [];
    list.push(row); servicesByCustomer.set(row.customer_id, list);
  }
  const now = Date.now();
  const customers: CustomerAnalyticsRow[] = (customerResult.data ?? []).map((row: any) => {
    const services = servicesByCustomer.get(row.id) ?? [];
    const dates = services.map((service) => service.completed_at || service.started_at || service.created_at).filter(Boolean).sort();
    const lifetime = services.reduce((sum, service) => sum + Number(service.total_amount ?? 0), 0);
    const count = services.length;
    const last = dates.length ? String(dates[dates.length - 1]) : null;
    const first = dates.length ? String(dates[0]) : null;
    const days = last ? Math.max(0, Math.floor((now - Date.parse(last)) / 86_400_000)) : null;
    return {
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: row.email,
      lifetime_value: lifetime,
      total_services: count,
      average_order_value: count ? lifetime / count : 0,
      days_since_last_service: days,
      churn_risk: days == null ? null : days >= 180 ? "high" : days >= 90 ? "medium" : "low",
      customer_segment: count >= 5 || lifetime >= 1000 ? "VIP" : count >= 2 ? "Repeat" : count === 1 ? "One-time" : "New",
      last_service_date: last,
      first_service_date: first || row.created_at,
    };
  }).sort((a, b) => b.lifetime_value - a.lifetime_value);

  return {
    customers,
    totalLifetimeValue: customers.reduce((sum, row) => sum + row.lifetime_value, 0),
    repeat: customers.filter((row) => row.total_services >= 2).length,
    oneTime: customers.filter((row) => row.total_services === 1).length,
    dueForService: customers.filter((row) => (row.days_since_last_service ?? 0) >= 90).sort((a, b) => (b.days_since_last_service ?? 0) - (a.days_since_last_service ?? 0)).slice(0, 10),
    churnRisk: customers.filter((row) => row.churn_risk === "high" || row.churn_risk === "medium").slice(0, 10),
    topByValue: customers.slice(0, 10),
  };
}

export interface TechnicianRef { id: string; name: string; status: string | null; }
export async function fetchTechniciansForReports(_userId: string): Promise<TechnicianRef[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data: members, error } = await db.from("workspace_members").select("user_id,role,is_active").eq("workspace_id", context.workspaceId).eq("is_active", true);
  if (error) throw error;
  const techIds = (members ?? []).filter((member: any) => member.role === "technician").map((member: any) => member.user_id);
  if (!techIds.length) return [];
  const { data: profiles, error: profileError } = await db.from("profiles").select("id,display_name").in("id", techIds);
  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.display_name]));
  return techIds.map((id: string) => ({ id, name: String(names.get(id) || "Technician"), status: "active" }));
}

export interface MarketingAttributionRow { source: string; bookings: number; billed: number; }
export async function fetchEarliestActivityDate(): Promise<Date | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const [apptRes, serviceRes] = await Promise.all([
    db.from("appointments").select("starts_at").eq("workspace_id", context.workspaceId).order("starts_at", { ascending: true }).limit(1),
    db.from("service_records").select("created_at").eq("workspace_id", context.workspaceId).order("created_at", { ascending: true }).limit(1),
  ]);
  if (apptRes.error) throw apptRes.error;
  if (serviceRes.error) throw serviceRes.error;
  const candidates = [apptRes.data?.[0]?.starts_at, serviceRes.data?.[0]?.created_at].filter(Boolean).map((value) => new Date(String(value)));
  if (!candidates.length) return null;
  return candidates.reduce((earliest, current) => current < earliest ? current : earliest);
}
