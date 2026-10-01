/** Customer segmentation/report demographic queries. */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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

export async function getCurrentUserId(): Promise<string | null> { const { data: { user } } = await getCurrentAuthUser(); return user?.id ?? null; }

export async function fetchSegments(_userId: string): Promise<SegmentRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data } = await apiClient.get<{ data: SegmentRow[] }>("/v1/crm/segments", {
    query: { workspace_id: context.workspaceId },
  });
  return data ?? [];
}

/** Resolve segment membership from canonical customer + service-record facts. */
export async function fetchSegmentCustomers(_userId: string, segmentName: string): Promise<{ data: SegmentCustomerRow[]; error: null }> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const { data } = await apiClient.get<{ data: SegmentCustomerRow[] }>(
    `/v1/crm/segments/${encodeURIComponent(segmentName)}/customers`,
    { query: { workspace_id: context.workspaceId } },
  );
  return { data: data ?? [], error: null };
}

export async function fetchLocationDemographicCustomers(_userId: string): Promise<LocationDemographicCustomer[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data } = await apiClient.get<{ data: LocationDemographicCustomer[] }>("/v1/crm/segments/demographics", {
    query: { workspace_id: context.workspaceId },
  });
  return data ?? [];
}
