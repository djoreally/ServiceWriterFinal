/**
 * Realtime technician locations - channel subscription abstraction
 */
import { supabase } from "@/integrations/supabase/client";
import { toLatLng } from "@/lib/dispatch-state";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface TechLocationUpdate {
  techId: string;
  lat: number;
  lng: number;
  status?: string;
}

export interface TechLocationChannelOptions {
  userId: string;
  onLocationUpdate?: (update: TechLocationUpdate) => void;
  onStatusChange?: (techId: string, newStatus: string) => void;
}

export function subscribeTechLocations(opts: TechLocationChannelOptions): {
  channel: RealtimeChannel;
  unsubscribe: () => void;
} {
  const channelName = `tech-locations-${opts.userId}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "technicians", filter: `user_id=eq.${opts.userId}` },
      (payload) => {
        const newRec = payload.new as Record<string, unknown>;
        const oldRec = payload.old as Record<string, unknown>;
        const techId = newRec.id as string;

        if (newRec.status !== oldRec.status && newRec.status) {
          opts.onStatusChange?.(techId, newRec.status as string);
        }

        const loc = newRec.current_location as { lat?: unknown; lng?: unknown } | null;
        const coords = loc ? toLatLng(loc.lat, loc.lng) : null;
        if (coords) {
          opts.onLocationUpdate?.({
            techId,
            lat: coords.lat,
            lng: coords.lng,
            status: newRec.status as string | undefined,
          });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "location_history" },
      (payload) => {
        const record = payload.new as Record<string, unknown>;
        const loc = record.location as { lat?: unknown; lng?: unknown } | null;
        const coords = loc ? toLatLng(loc.lat, loc.lng) : null;
        if (coords && record.technician_id) {
          opts.onLocationUpdate?.({
            techId: record.technician_id as string,
            lat: coords.lat,
            lng: coords.lng,
          });
        }
      },
    )
    .subscribe();

  return {
    channel,
    unsubscribe: () => supabase.removeChannel(channel),
  };
}
