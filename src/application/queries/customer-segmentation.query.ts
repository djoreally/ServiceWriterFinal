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

function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export async function getCurrentUserId(): Promise<string | null> { const { data: { user } } = await getCurrentAuthUser(); return user?.id ?? null; }

export async function fetchSegments(_userId: string): Promise<SegmentRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await db.from("customer_segments").select("*").eq("workspace_id", context.workspaceId).order("priority", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SegmentRow[];
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
