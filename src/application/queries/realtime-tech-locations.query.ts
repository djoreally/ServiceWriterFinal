/**
 * Realtime technician locations.
 *
 * Final does not yet have a canonical technician-location table. The retired
 * Lovable `technicians` and `location_history` subscriptions are intentionally
 * disabled so Command Center does not subscribe to objects that do not exist.
 */
import { supabase } from "@/integrations/supabase/client";
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
  const channel = supabase.channel(`tech-locations-disabled-${opts.userId}`);
  return {
    channel,
    unsubscribe: () => { void supabase.removeChannel(channel); },
  };
}
