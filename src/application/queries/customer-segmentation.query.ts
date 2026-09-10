/** Customer segmentation/report demographic queries. */
import { productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface SegmentRow {
  id: string; name: string; description: string | null; color: string; icon: string;
  min_lifetime_value: number | null; max_lifetime_value: number | null; min_total_services: number | null; max_total_services: number | null;
  min_days_since_service: number | null; max_days_since_service: number | null; min_average_order: number | null; max_average_order: number | null;
  is_auto: boolean; priority: number; auto_follow_up_days: number | null; is_active: boolean; member_count: number;
  last_calculated_at: string | null; calculation_status: "stale" | "calculating" | "current" | "failed";
  calculation_started_at: string | null; calculation_error: string | null; geo_center_lat: number | null; geo_center_lng: number | null; geo_radius_miles: number | null;
}
export interface LocationDemographicCustomer { id: string; name: string; address: string | null; postal_code: string | null; latitude: number | null; longitude: number | null; lifetime_value: number | null; total_services: number | null; }
export interface SegmentCustomerRow { id: string; name: string; email: string | null; phone: string | null; lifetime_value: number; total_services: number; last_service_date: string | null; }

function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function matches(value: number | null, min: number | null, max: number | null): boolean {
  if (min != null && (value == null || value < Number(min))) return false;
  if (max != null && (value == null || value > Number(max))) return false;
  return true;
}
export async function getCurrentUserId(): Promise<string | null> { const { data: { user } } = await getCurrentAuthUser(); return user?.id ?? null; }

export async function fetchSegments(_userId: string): Promise<SegmentRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await db.from("customer_segments").select("*").eq("workspace_id", context.workspaceId).order("priority", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SegmentRow[];
}

/** Resolve segment membership from canonical customer + service-record facts. */
export async function fetchSegmentCustomers(_userId: string, segmentName: string): Promise<{ data: SegmentCustomerRow[]; error: null }> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const [segmentResult, customerResult, serviceResult] = await Promise.all([
    db.from("customer_segments").select("*").eq("workspace_id", context.workspaceId).eq("name", segmentName).maybeSingle(),
    db.from("customers").select("id,first_name,last_name,company_name,email,phone").eq("workspace_id", context.workspaceId).neq("status", "archived"),
    db.from("service_records").select("customer_id,total_amount,completed_at,started_at,created_at").eq("workspace_id", context.workspaceId),
  ]);
  if (segmentResult.error) throw segmentResult.error;
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;
  const segment = segmentResult.data as SegmentRow | null;
  if (!segment) return { data: [], error: null };

  const servicesByCustomer = new Map<string, any[]>();
  for (const service of serviceResult.data ?? []) {
    if (!service.customer_id) continue;
    const list = servicesByCustomer.get(service.customer_id) ?? [];
    list.push(service); servicesByCustomer.set(service.customer_id, list);
  }
  const now = Date.now();
  const rows: SegmentCustomerRow[] = [];
  for (const customer of customerResult.data ?? []) {
    const services = servicesByCustomer.get(customer.id) ?? [];
    const lifetime = services.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const total = services.length;
    const average = total ? lifetime / total : 0;
    const dates = services.map((row) => row.completed_at || row.started_at || row.created_at).filter(Boolean).map((value) => Date.parse(String(value))).filter(Number.isFinite);
    const lastMs = dates.length ? Math.max(...dates) : null;
    const days = lastMs == null ? null : Math.max(0, Math.floor((now - lastMs) / 86_400_000));
    if (!matches(lifetime, segment.min_lifetime_value, segment.max_lifetime_value) ||
        !matches(total, segment.min_total_services, segment.max_total_services) ||
        !matches(days, segment.min_days_since_service, segment.max_days_since_service) ||
        !matches(average, segment.min_average_order, segment.max_average_order)) continue;
    rows.push({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || "Customer",
      email: customer.email,
      phone: customer.phone,
      lifetime_value: lifetime,
      total_services: total,
      last_service_date: lastMs == null ? null : new Date(lastMs).toISOString(),
    });
  }
  rows.sort((a, b) => b.lifetime_value - a.lifetime_value);
  return { data: rows.slice(0, 500), error: null };
}

export async function fetchLocationDemographicCustomers(_userId: string): Promise<LocationDemographicCustomer[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const [customerResult, serviceResult] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,address_line1,address_line2,city,region,postal_code,metadata").eq("workspace_id", context.workspaceId),
    db.from("service_records").select("customer_id,total_amount").eq("workspace_id", context.workspaceId),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;
  const totals = new Map<string, { value: number; count: number }>();
  for (const service of serviceResult.data ?? []) {
    if (!service.customer_id) continue;
    const current = totals.get(service.customer_id) ?? { value: 0, count: 0 };
    current.value += Number(service.total_amount ?? 0); current.count += 1; totals.set(service.customer_id, current);
  }
  return (customerResult.data ?? []).map((row: any) => {
    const metadata = metadataObject(row.metadata); const summary = totals.get(row.id) ?? { value: 0, count: 0 };
    const latitude = Number(metadata.latitude ?? metadata.lat); const longitude = Number(metadata.longitude ?? metadata.lng);
    return {
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", ") || null,
      postal_code: row.postal_code,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      lifetime_value: summary.value,
      total_services: summary.count,
    };
  });
}
