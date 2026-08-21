/**
 * Realtime Workflow Hook Infrastructure
 * Provides Supabase realtime channel management for the application layer.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type { RealtimeChannel, RealtimePostgresChangesPayload };

export function createWorkflowChannel(
  channelName: string,
  tables: { table: string; type: string }[],
  handler: (type: string, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
): RealtimeChannel {
  let channel = supabase.channel(channelName);

  for (const { table, type } of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => handler(type, payload)
    );
  }

  return channel;
}

export function removeChannel(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}
