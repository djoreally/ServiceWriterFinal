/** Reports supporting queries backed by canonical workspace tables. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CustomerAnalyticsRow { id: string; name: string; email: string | null; lifetime_value: number; total_services: number; average_order_value: number; days_since_last_service: number | null; churn_risk: string | null; customer_segment: string | null; last_service_date: string | null; first_service_date: string | null; }
export interface CustomerAnalytics { customers: CustomerAnalyticsRow[]; totalLifetimeValue: number; repeat: number; oneTime: number; dueForService: CustomerAnalyticsRow[]; churnRisk: CustomerAnalyticsRow[]; topByValue: CustomerAnalyticsRow[]; }

const parseValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
};

export async function fetchCustomerAnalytics(_userId: string): Promise<CustomerAnalytics> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const { customerRows, serviceRows } = await apiClient.get<{ customerRows: any[]; serviceRows: any[] }>(
    "/v1/platform/reports/customer-analytics-rows",
    { query: { selected_workspace_id: context.workspaceId } },
  );

  const servicesByCustomer = new Map<string, Array<Record<string, any>>>();
  for (const row of serviceRows ?? []) {
    if (!row.customer_id) continue;
    const list = servicesByCustomer.get(row.customer_id) ?? [];
    list.push(row); servicesByCustomer.set(row.customer_id, list);
  }
  const now = Date.now();
  const customers: CustomerAnalyticsRow[] = (customerRows ?? []).map((row: any) => {
    const services = servicesByCustomer.get(row.id) ?? [];
    const dates = services.map((service) => service.completed_at || service.started_at || service.created_at).filter(Boolean).sort();
    const lifetime = services.reduce((sum, service) => sum + Number(service.total_amount ?? 0), 0);
    const count = services.length;
    const last = dates.length ? String(dates[dates.length - 1]) : null;
    const first = dates.length ? String(dates[0]) : null;
    const lastDate = parseValidDate(last);
    const days = lastDate ? Math.max(0, Math.floor((now - lastDate.getTime()) / 86_400_000)) : null;
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
      last_service_date: lastDate ? lastDate.toISOString() : null,
      first_service_date: parseValidDate(first)?.toISOString() || parseValidDate(row.created_at)?.toISOString() || null,
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
  return apiClient.get<TechnicianRef[]>("/v1/platform/reports/technicians", {
    query: { selected_workspace_id: context.workspaceId },
  });
}

export interface MarketingAttributionRow { source: string; bookings: number; billed: number; }
export async function fetchEarliestActivityDate(): Promise<Date | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const { apptStartsAt, serviceCreatedAt } = await apiClient.get<{ apptStartsAt: string | null; serviceCreatedAt: string | null }>(
    "/v1/platform/reports/earliest-activity",
    { query: { selected_workspace_id: context.workspaceId } },
  );
  const candidates = [apptStartsAt, serviceCreatedAt].map(parseValidDate).filter((value): value is Date => value !== null);
  if (!candidates.length) return null;
  return candidates.reduce((earliest, current) => current < earliest ? current : earliest);
}
