/**
 * Realtime technician locations.
 *
 * Final does not yet have a canonical technician-location table. The retired
 * Lovable `technicians` and `location_history` subscriptions are intentionally
 * disabled so Command Center does not subscribe to objects that do not exist.
 *
 * There is no realtime primitive on the sanctioned API client, so this keeps
 * the disabled no-op subscription: it returns the same shape without opening
 * a channel. The exported signature is unchanged.
 */
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
  void opts;
  return {
    // Intentionally disabled: no channel is opened. Callers only use
    // `unsubscribe`, so this is never dereferenced.
    channel: null as unknown as RealtimeChannel,
    unsubscribe: () => {},
  };
}
