/**
 * Retention Action Commands — Inline workflows from the Action Queue.
 *
 * - snoozeSignal: marks signal suppressed and stamps a snooze_until in payload_jsonb
 *   (no schema change; expires_at column not present).
 * - dismissSignal: marks signal suppressed.
 * - resolveSignal: marks signal resolved (with resolved_at).
 * - bulkEnqueueAction: writes one job_queue row per signal and flips signals → active.
 */
import { apiClient } from "@/lib/api-client";

export type RetentionActionType =
  | "send_winback_sms"
  | "send_winback_email"
  | "issue_reward"
  | "send_reminder"
  | "schedule_call"
  | "send_recovery_offer"
  | "award_points";

export async function snoozeSignal(signalId: string, days = 30) {
  await apiClient.post("/v1/crm/retention/signals/snooze", {
    signal_ids: [signalId],
    days,
  });
}

export async function snoozeSignals(signalIds: string[], days = 30) {
  if (!signalIds.length) return;
  await apiClient.post("/v1/crm/retention/signals/snooze", {
    signal_ids: signalIds,
    days,
  });
}

export async function dismissSignal(signalId: string) {
  await apiClient.post("/v1/crm/retention/signals/dismiss", {
    signal_ids: [signalId],
  });
}

export async function dismissSignals(signalIds: string[]) {
  if (!signalIds.length) return;
  await apiClient.post("/v1/crm/retention/signals/dismiss", {
    signal_ids: signalIds,
  });
}

export async function resolveSignal(signalId: string) {
  await apiClient.post("/v1/crm/retention/signals/resolve", {
    signal_ids: [signalId],
  });
}

export async function resolveSignals(signalIds: string[]) {
  if (!signalIds.length) return;
  await apiClient.post("/v1/crm/retention/signals/resolve", {
    signal_ids: signalIds,
  });
}

/**
 * Enqueue a job per signal and mark signals as active.
 * Each job_queue row has job_type=`retention.<actionType>` with the signal id in payload.
 */
export async function bulkEnqueueAction(params: {
  userId: string;
  signalIds: string[];
  actionType: RetentionActionType;
  config?: Record<string, unknown>;
}) {
  const { signalIds, actionType, config } = params;
  if (!signalIds.length) return { enqueued: 0 };

  const { data } = await apiClient.post<{ data: { enqueued: number } }>(
    "/v1/crm/retention/actions/enqueue",
    {
      signal_ids: signalIds,
      action_type: actionType,
      config: config || {},
    },
  );
  return { enqueued: data?.enqueued ?? signalIds.length };
}
