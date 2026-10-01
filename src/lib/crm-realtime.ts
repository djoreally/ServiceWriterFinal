/**
 * CRM realtime subscriptions — isolated from the HTTP API boundary.
 *
 * `apiClient` is HTTP-only; websocket subscriptions keep the browser Supabase
 * client here, behind stable re-exported helpers.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function subscribeCustomerSegmentUpdates(
  onUpdate: (row: { id: string; [k: string]: unknown }) => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase
    .channel("segment_counts")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "customer_segments" },
      (payload) => onUpdate(payload.new as { id: string; [k: string]: unknown }),
    )
    .subscribe();
  return { channel, unsubscribe: () => void supabase.removeChannel(channel) };
}

export function subscribeLiveVisitorsChannel(
  onChange: () => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase
    .channel("live_presence")
    .on("postgres_changes", { event: "*", schema: "public", table: "visitor_presence" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "analytics_events" }, onChange)
    .subscribe();
  return { channel, unsubscribe: () => void supabase.removeChannel(channel) };
}
