/**
 * Fleet Tracking — Data access for the client-facing live tracking page.
 */
import { apiClient } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type TrackingWorkOrderRow = Database["public"]["Tables"]["fleet_work_orders"]["Row"] & {
  fleet_clients: { company_name: string } | null;
  fleet_locations: Database["public"]["Tables"]["fleet_locations"]["Row"] | null;
  technicians: (Database["public"]["Tables"]["technicians"]["Row"] & { current_location: { lat: number; lng: number } | null }) | null;
};

async function rawGet<T>(path: string): Promise<{ data: T | null; error: unknown }> {
  try {
    const { data } = await apiClient.get<{ data: T }>(path);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchTrackingWorkOrder(orderId: string) {
  return rawGet<TrackingWorkOrderRow>(`/v1/fleet/work-orders/${orderId}/tracking`);
}

export interface TechnicianUpdatePayload {
  id: string;
  current_location: { lat: number; lng: number } | null;
  [key: string]: unknown;
}

export function subscribeTechnicianUpdates(
  channelName: string,
  onUpdate: (row: TechnicianUpdatePayload) => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  return { channel: null as unknown as RealtimeChannel, unsubscribe: () => {} };
}
