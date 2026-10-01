import { apiClient } from "@/lib/api-client";

export type LiveVisitorPresence = {
  id: string;
  visitor_id: string;
  current_path: string | null;
  state: "active" | "idle" | "offline";
  heartbeat_at: string;
  device_type: string | null;
};

export type LiveVisitorEvent = { event_name: string; created_at: string };

export async function fetchLiveVisitors(workspaceOwnerUserId: string, cutoff: string): Promise<{
  rows: LiveVisitorPresence[];
  events: LiveVisitorEvent[];
}> {
  const { data } = await apiClient.get<{ data: { rows: LiveVisitorPresence[]; events: LiveVisitorEvent[] } }>(
    "/v1/crm/marketing/live-visitors",
    { query: { owner_user_id: workspaceOwnerUserId, cutoff } },
  );
  return { rows: data.rows ?? [], events: data.events ?? [] };
}
