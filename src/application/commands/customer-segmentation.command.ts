/** Customer Segmentation Commands — workspace-scoped writes and recalculation. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { SegmentRow } from "@/application/queries/customer-segmentation.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
const db = productionSupabase as any;

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

export async function saveSegment(_userId: string, segment: Partial<SegmentRow>, isEdit: boolean) {
  const { userId, workspaceId } = await requireContext();
  const payload = { ...segment, id: undefined, workspace_id: workspaceId, user_id: userId, updated_at: new Date().toISOString() };
  if (isEdit && segment.id) {
    const { error } = await db.from("customer_segments").update(payload).eq("workspace_id", workspaceId).eq("id", segment.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("customer_segments").insert(payload);
    if (error) throw error;
  }
}

export async function deleteSegment(segmentId: string) {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("customer_segments").delete().eq("workspace_id", workspaceId).eq("id", segmentId);
  if (error) throw error;
}

function matches(value: number | null, min: unknown, max: unknown): boolean {
  if (min != null && (value == null || value < Number(min))) return false;
  if (max != null && (value == null || value > Number(max))) return false;
  return true;
}

export async function recalculateAllCustomers(): Promise<number> {
  const { workspaceId } = await requireContext();
  const [customersRes, servicesRes, segmentsRes] = await Promise.all([
    db.from("customers").select("id,created_at").eq("workspace_id", workspaceId),
    db.from("service_records").select("customer_id,total_amount,completed_at,started_at,created_at").eq("workspace_id", workspaceId),
    db.from("customer_segments").select("*").eq("workspace_id", workspaceId).eq("is_active", true),
  ]);
  if (customersRes.error) throw customersRes.error;
  if (servicesRes.error) throw servicesRes.error;
  if (segmentsRes.error) throw segmentsRes.error;

  const servicesByCustomer = new Map<string, any[]>();
  for (const service of servicesRes.data ?? []) {
    if (!service.customer_id) continue;
    const list = servicesByCustomer.get(service.customer_id) ?? [];
    list.push(service);
    servicesByCustomer.set(service.customer_id, list);
  }
  const now = Date.now();
  const stats = (customersRes.data ?? []).map((customer: any) => {
    const services = servicesByCustomer.get(customer.id) ?? [];
    const lifetime = services.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const dates = services.map((row) => row.completed_at || row.started_at || row.created_at).filter(Boolean).map((value) => Date.parse(String(value))).filter(Number.isFinite);
    const last = dates.length ? Math.max(...dates) : null;
    return {
      id: customer.id,
      lifetime,
      total: services.length,
      average: services.length ? lifetime / services.length : 0,
      days: last == null ? null : Math.max(0, Math.floor((now - last) / 86_400_000)),
    };
  });

  const timestamp = new Date().toISOString();
  for (const segment of segmentsRes.data ?? []) {
    const memberCount = stats.filter((customer) =>
      matches(customer.lifetime, segment.min_lifetime_value, segment.max_lifetime_value) &&
      matches(customer.total, segment.min_total_services, segment.max_total_services) &&
      matches(customer.days, segment.min_days_since_service, segment.max_days_since_service) &&
      matches(customer.average, segment.min_average_order, segment.max_average_order)
    ).length;
    const { error } = await db.from("customer_segments").update({
      member_count: memberCount,
      last_calculated_at: timestamp,
      calculation_status: "current",
      calculation_started_at: null,
      calculation_error: null,
      updated_at: timestamp,
    }).eq("workspace_id", workspaceId).eq("id", segment.id);
    if (error) throw error;
  }
  return stats.length;
}
