/**
 * Retention Action Commands — Inline workflows from the Action Queue.
 *
 * - snoozeSignal: marks signal suppressed and stamps a snooze_until in payload_jsonb
 *   (no schema change; expires_at column not present).
 * - dismissSignal: marks signal suppressed.
 * - resolveSignal: marks signal resolved (with resolved_at).
 * - bulkEnqueueAction: writes one job_queue row per signal and flips signals → active.
 */
import { supabase } from "@/integrations/supabase/client";

export type RetentionActionType =
  | "send_winback_sms"
  | "send_winback_email"
  | "issue_reward"
  | "send_reminder"
  | "schedule_call"
  | "send_recovery_offer"
  | "award_points";

export async function snoozeSignal(signalId: string, days = 30) {
  const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  // Read existing payload, merge snooze marker.
  const { data: existing, error: readErr } = await supabase
    .from("retention_signals")
    .select("payload_jsonb")
    .eq("id", signalId)
    .single();
  if (readErr) throw readErr;
  const merged = {
    ...((existing?.payload_jsonb as Record<string, unknown> | null) || {}),
    snooze_until: snoozeUntil,
    snoozed_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("retention_signals")
    .update({ status: "suppressed", payload_jsonb: merged })
    .eq("id", signalId);
  if (error) throw error;
}

export async function snoozeSignals(signalIds: string[], days = 30) {
  await Promise.all(signalIds.map((id) => snoozeSignal(id, days)));
}

export async function dismissSignal(signalId: string) {
  const { error } = await supabase
    .from("retention_signals")
    .update({ status: "suppressed" })
    .eq("id", signalId);
  if (error) throw error;
}

export async function dismissSignals(signalIds: string[]) {
  if (!signalIds.length) return;
  const { error } = await supabase
    .from("retention_signals")
    .update({ status: "suppressed" })
    .in("id", signalIds);
  if (error) throw error;
}

export async function resolveSignal(signalId: string) {
  const { error } = await supabase
    .from("retention_signals")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", signalId);
  if (error) throw error;
}

export async function resolveSignals(signalIds: string[]) {
  if (!signalIds.length) return;
  const { error } = await supabase
    .from("retention_signals")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .in("id", signalIds);
  if (error) throw error;
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
  const { userId, signalIds, actionType, config } = params;
  if (!signalIds.length) return { enqueued: 0 };

  // Fetch signals to capture customer/vehicle context in payload
  const { data: signals, error: fetchErr } = await supabase
    .from("retention_signals")
    .select("id, signal_type, customer_id, vehicle_id")
    .in("id", signalIds);
  if (fetchErr) throw fetchErr;

  const jobs = (signals || []).map((s) => ({
    user_id: userId,
    job_type: `retention.${actionType}`,
    priority: 5,
    payload_jsonb: {
      signal_id: s.id,
      signal_type: s.signal_type,
      customer_id: s.customer_id,
      vehicle_id: s.vehicle_id,
      config: (config || {}) as Record<string, unknown>,
    } as unknown as never,
  }));

  const { error: insertErr } = await supabase.from("job_queue").insert(jobs);
  if (insertErr) throw insertErr;

  // Flip signals → active so they exit the queue
  const { error: updateErr } = await supabase
    .from("retention_signals")
    .update({ status: "active" })
    .in("id", signalIds);
  if (updateErr) throw updateErr;

  return { enqueued: jobs.length };
}
