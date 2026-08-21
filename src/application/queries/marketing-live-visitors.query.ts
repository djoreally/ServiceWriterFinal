import { supabase } from "@/integrations/supabase/client";

export type LiveVisitorPresence = {
  id: string;
  visitor_id: string;
  current_path: string | null;
  state: "active" | "idle" | "offline";
  heartbeat_at: string;
  device_type: string | null;
};

export type LiveVisitorEvent = { event_name: string; created_at: string };

const LEGACY_TENANT_ID_COLUMN = "tenant_id" as const;

export async function fetchLiveVisitors(workspaceOwnerUserId: string, cutoff: string): Promise<{
  rows: LiveVisitorPresence[];
  events: LiveVisitorEvent[];
}> {
  const { data } = await supabase
    .from("visitor_presence")
    .select("id,visitor_id,current_path,state,heartbeat_at,device_type")
    .eq(LEGACY_TENANT_ID_COLUMN, workspaceOwnerUserId)
    .in("state", ["active", "idle"])
    .gte("heartbeat_at", cutoff);

  const { data: liveEvents } = await supabase
    .from("analytics_events")
    .select("event_name, created_at")
    .eq(LEGACY_TENANT_ID_COLUMN, workspaceOwnerUserId)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    rows: (data ?? []) as LiveVisitorPresence[],
    events: (liveEvents ?? []) as LiveVisitorEvent[],
  };
}
