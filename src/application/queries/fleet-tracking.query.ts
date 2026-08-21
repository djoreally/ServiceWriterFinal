/**
 * Fleet Tracking — Data access for the client-facing live tracking page.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export async function fetchTrackingWorkOrder(orderId: string) {
  return supabase
    .from("fleet_work_orders")
    .select("*, fleet_clients(company_name), fleet_locations(*), technicians(*)")
    .eq("id", orderId)
    .single();
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
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "technicians" },
      (payload) => onUpdate(payload.new as TechnicianUpdatePayload),
    )
    .subscribe();
  return { channel, unsubscribe: () => void supabase.removeChannel(channel) };
}
