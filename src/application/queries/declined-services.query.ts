/** Declined Services Queries — canonical workspace reads. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

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
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const [declinedRes, customerRes, vehicleRes] = await Promise.all([
    db.from("declined_services").select("*,customers(first_name,last_name,company_name,email,phone),vehicles(year,make,model)").eq("workspace_id", context.workspaceId).order("declined_at", { ascending: false }),
    db.from("customers").select("id,first_name,last_name,company_name").eq("workspace_id", context.workspaceId),
    db.from("vehicles").select("id,customer_id,year,make,model").eq("workspace_id", context.workspaceId).order("make"),
  ]);
  if (declinedRes.error) throw declinedRes.error;
  if (customerRes.error) throw customerRes.error;
  if (vehicleRes.error) throw vehicleRes.error;
  const formattedData = (declinedRes.data ?? []).map((d: any) => {
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
    customers: (customerRes.data ?? []).map((c: any) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Customer" })),
    vehicles: (vehicleRes.data ?? []).map((v: any) => ({ id: v.id, info: [v.year, v.make, v.model].filter(Boolean).join(" "), customer_id: v.customer_id })),
  };
}
