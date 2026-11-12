/**
 * Built-in telemetry read queries (owner-tier surfaces).
 *
 * Thin typed wrappers over the telemetry read API. Every endpoint is
 * owner/admin-gated server-side; these helpers just shape the calls
 * for the Analytics console and the platform-admin activity view.
 */
import { apiClient } from "@/lib/api-client";

export interface TelemetryWorkspaceUser {
  user_id: string;
  user_email: string | null;
  role: string | null;
  sessions: number;
  pageviews: number;
  last_seen_at: string;
}

export interface TelemetryEventRow {
  id: string;
  session_id: string;
  workspace_id?: string | null;
  user_id: string | null;
  user_email: string | null;
  role: string | null;
  stream?: string;
  event_type: string;
  funnel_step: string | null;
  url: string;
  path: string;
  title: string | null;
  occurred_at: string;
  target: string | null;
  target_text: string | null;
  scroll_depth: number | null;
  engaged_ms: number | null;
  metadata: Record<string, unknown> | null;
}

export interface FunnelStepRow {
  step: string;
  sessions: number;
  dropoff_from_previous: number;
}

export interface LostBookingRow {
  session_id: string;
  visitor_id: string | null;
  last_step: string | null;
  started_at: string;
  last_seen_at: string;
  entry_url: string;
  entry_source: string;
  pageviews: number;
  engaged_ms: number;
}

export interface FunnelReport {
  steps: FunnelStepRow[];
  totals: { journeys: number; confirmed: number; conversion_rate: number };
  lost_bookings: LostBookingRow[];
  cohorts: {
    by_week: Array<{ week: string; journeys: number; confirmed: number }>;
    by_source: Array<{ source: string; journeys: number; confirmed: number }>;
  };
}

export interface ServiceInsightRow {
  service_id: string;
  service_name: string | null;
  price: number | null;
  viewed_sessions: number;
  selected_sessions: number;
  confirmed_sessions: number;
  viewed_not_bought_sessions: number;
}

export async function fetchTelemetryUsers(workspaceId: string): Promise<TelemetryWorkspaceUser[]> {
  const res = await apiClient.get<{ data: TelemetryWorkspaceUser[] }>("/v1/telemetry/users", {
    query: { workspace_id: workspaceId },
  });
  return res?.data ?? [];
}

export async function fetchTelemetryEvents(
  workspaceId: string,
  userId?: string,
): Promise<TelemetryEventRow[]> {
  const res = await apiClient.get<{ data: TelemetryEventRow[] }>("/v1/telemetry/events", {
    query: { workspace_id: workspaceId, user_id: userId, limit: 500 },
  });
  return res?.data ?? [];
}

export async function fetchBookingFunnel(workspaceId: string, days: number): Promise<FunnelReport> {
  const res = await apiClient.get<{ data: FunnelReport }>("/v1/telemetry/funnel", {
    query: { workspace_id: workspaceId, days },
  });
  return res.data;
}

export async function fetchServiceInsight(workspaceId: string, days: number): Promise<ServiceInsightRow[]> {
  const res = await apiClient.get<{ data: ServiceInsightRow[] }>("/v1/telemetry/services", {
    query: { workspace_id: workspaceId, days },
  });
  return res?.data ?? [];
}

export async function fetchPlatformUserActivity(email: string): Promise<TelemetryEventRow[]> {
  const res = await apiClient.get<{ data: TelemetryEventRow[] }>("/v1/telemetry/platform/user-activity", {
    query: { user_email: email, limit: 500 },
  });
  return res?.data ?? [];
}
