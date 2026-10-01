/** Declined Services Queries — canonical workspace reads.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. Row formatting and
 * metrics stay client-side; exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export interface DeclinedServiceRow {
  id: string; customer_id: string; customer_name?: string; customer_email?: string; customer_phone?: string;
  vehicle_id: string; vehicle_info?: string; recommended_service: string; catalog_item_id: string | null; estimated_cost: number;
  urgency: "required" | "recommended" | "optional"; decline_reason: string | null; decline_notes: string | null; declined_at: string;
  follow_up_scheduled_for: string | null; follow_up_sent_at: string | null; follow_up_status: "pending" | "sent" | "converted" | "expired";
  was_converted: boolean; potential_revenue: number;
}
export interface DeclinedServiceMetrics { totalDeclined: number; totalLostRevenue: number; pendingFollowUps: number; converted: number; conversionRate: number; recoveredRevenue: number; }
export interface DeclinedServicesDataResult { services: DeclinedServiceRow[]; metrics: DeclinedServiceMetrics; customers: Array<{ id: string; name: string }>; vehicles: Array<{ id: string; info: string; customer_id: string }>; }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export async function fetchDeclinedServicesData(): Promise<DeclinedServicesDataResult> {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("No active workspace is available.");
  const response = await apiClient.get<{
    data: { services: any[]; customers: any[]; vehicles: any[] };
  }>(`/v1/declined-services`, { query: { workspace_id: workspaceId } });
  const declined = response.data?.services ?? [];
  const customerRows = response.data?.customers ?? [];
  const vehicleRows = response.data?.vehicles ?? [];
  const formattedData = declined.map((d: any) => {
    const customer = one<any>(d.customers); const vehicle = one<any>(d.vehicles);
    return {
      ...d,
      customer_name: customer ? ([customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || "Unknown") : "Unknown",
      customer_email: customer?.email ?? undefined,
      customer_phone: customer?.phone ?? undefined,
      vehicle_info: vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "Unknown",
    } as DeclinedServiceRow;
  });
  const totalLostRevenue = formattedData.reduce((sum, d) => sum + Number(d.potential_revenue || 0), 0);
  const converted = formattedData.filter((d) => d.was_converted).length;
  const recoveredRevenue = formattedData.filter((d) => d.was_converted).reduce((sum, d) => sum + Number(d.potential_revenue || 0), 0);
  const pendingFollowUps = formattedData.filter((d) => d.follow_up_status === "pending").length;
  return {
    services: formattedData,
    metrics: { totalDeclined: formattedData.length, totalLostRevenue, pendingFollowUps, converted, conversionRate: formattedData.length ? converted / formattedData.length * 100 : 0, recoveredRevenue },
    customers: customerRows.map((c: any) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Customer" })),
    vehicles: vehicleRows.map((v: any) => ({ id: v.id, info: [v.year, v.make, v.model].filter(Boolean).join(" "), customer_id: v.customer_id })),
  };
}
