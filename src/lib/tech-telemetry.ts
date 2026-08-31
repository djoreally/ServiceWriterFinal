/**
 * Technician OS telemetry (Phase 4 — instrumentation).
 *
 * One place that emits every field-app signal we operate on: shift transitions,
 * job lifecycle transitions, messaging, navigation, completion blocks and sync
 * failures. Wraps the PostHog facade so analytics can never break a field flow.
 */
import posthog from "posthog-js";

export type TechTelemetryProps = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props: TechTelemetryProps = {}) {
  try {

    if (typeof window === "undefined" || !(posthog as any)?.__loaded) return;
    const { workspace_user_id, ...rest } = props;
    const enriched: Record<string, unknown> = { surface: "tech_app", ...rest };
    if (workspace_user_id) {
      enriched.workspace_user_id = workspace_user_id;
      enriched.$groups = { organization: String(workspace_user_id) };
    }
    posthog.capture(event, enriched);
  } catch {
    // never surface telemetry failures to the technician
  }
}

export function trackTechShiftTransition(props: {
  action: "clock_in" | "clock_out" | "break_start" | "break_end";
  technician_id?: string | null;
  workspace_user_id?: string | null;
  succeeded: boolean;
  error?: string | null;
}) {
  capture("tech shift transition", props);
}

export function trackTechJobTransition(props: {
  job_id: string;
  job_source: "appointment" | "fleet_work_order" | string;
  from_status?: string | null;
  to_status: string;
  workspace_user_id?: string | null;
  succeeded: boolean;
  error?: string | null;
  idempotency_key?: string | null;
}) {
  capture("tech job transition", props);
}

export function trackTechCompletionBlocked(props: {
  job_id: string;
  job_source: string;
  blocked_reason: string;
  pending_steps?: number;
  workspace_user_id?: string | null;
}) {
  capture("tech completion blocked", props);
}

export function trackTechMessageSent(props: {
  job_id: string;
  channel: "dispatch" | "customer_sms" | "customer_email" | string;
  succeeded: boolean;
  blocked_by_preference?: boolean;
  error?: string | null;
}) {
  capture("tech message sent", props);
}

export function trackTechNavigation(props: {
  job_id?: string | null;
  action: "directions_opened" | "route_opened" | "eta_recalculated" | "eta_emailed";
  distance_miles?: number | null;
  duration_minutes?: number | null;
  succeeded?: boolean;
}) {
  capture("tech navigation", props);
}

export function trackTechSyncFailure(props: {
  scope: "mission_board" | "job_workspace" | "thread" | "outbox" | "session";
  error: string;
  served_from_cache?: boolean;
  workspace_user_id?: string | null;
}) {
  capture("tech sync failure", props);
}

export function trackTechDataQualityAlert(props: {
  code: string;
  severity: "warning" | "critical";
  count: number;
  workspace_user_id?: string | null;
}) {
  capture("tech data quality alert", props);
}
