/**
 * Shop Agent Phase 1 — missed-call text-back flow (provider-agnostic).
 *
 * Shared by the AgentPhone `agent.call_ended` handler and the sweep:
 * 4h ledger dedupe → suppression check → quiet-hours deferral → policy gate
 * → send → ledger. Exactly-once comes from the ledger: a send never
 * happens when a `textback_sent` entry already covers the caller.
 *
 * Spec: ~/workspace/shop-agent/phase-1-sms-spec.md sections 2, 3, 6.
 */
import { checkPolicy, isQuietHours } from "../zeroai/policy";
import { checkGate } from "../zeroai/gates";
import { currentLocalMinutes, getShopProfile } from "../profile";
import { hashPhoneE164, sha256Hex } from "../zeroai/types";
import type { ShopProfile } from "../zeroai/types";
import type { ShopAgentSupabase } from "./db";
import { logLedgerEvent, newLedgerEvent } from "./ledger-events";
import { sendShopSms } from "./sending";
import type { ShopSmsSender } from "./sending";
import { isSuppressed } from "./suppressions";
import { TEXTBACK_TEMPLATE, renderTemplate } from "./templates";

export const TEXTBACK_DEDUPE_MS = 4 * 60 * 60 * 1000;

export interface TextBackRequest {
  workspaceId: string;
  /** E.164 caller number. */
  to: string;
  /** Stable provider-side reference for this call (callId, CallSid, …). */
  callRef: string;
  profile: ShopProfile;
  source: "call_ended" | "sweep_deferred";
}

export type TextBackOutcome =
  | { sent: true; providerMessageId: string }
  | { sent: false; reason: "deduped" | "suppressed" | "deferred" | "blocked" };

export async function ledgerHasRecentAction(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  actor: string,
  action: string,
  sinceIso: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shop_agent_ledger")
    .select("event_id")
    .eq("workspace_id", workspaceId)
    .eq("actor", actor)
    .eq("action", action)
    .gte("occurred_at", sinceIso)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export function callerHashFor(phone: string): string {
  return hashPhoneE164(phone);
}

async function textBackSendGate(input: {
  workspaceId: string;
  localTimeMinutes: number;
}): Promise<{ passed: boolean; reason: string }> {
  const policyDecision = checkPolicy("send_message", {
    workspaceId: input.workspaceId,
    localTimeMinutes: input.localTimeMinutes,
    optedOut: false,
  });
  const gate = await checkGate("policy_check", {
    policyAction: "send_message",
    policyCtx: {
      workspaceId: input.workspaceId,
      localTimeMinutes: input.localTimeMinutes,
      optedOut: false,
    },
  });
  const passed = policyDecision.decision === "act" && gate.passed;
  return {
    passed,
    reason: passed
      ? gate.reason
      : `${policyDecision.ruleId}: ${policyDecision.reason}; gate: ${gate.reason}`,
  };
}

export async function sendMissedCallTextBack(
  supabase: ShopAgentSupabase,
  sender: ShopSmsSender,
  req: TextBackRequest,
  opts?: { now?: Date },
): Promise<TextBackOutcome> {
  const now = opts?.now ?? new Date();
  const { workspaceId, to, callRef, profile } = req;
  const callerHash = callerHashFor(to);
  const timeZone = profile.hours.timezone || "UTC";
  const localMinutes = currentLocalMinutes(timeZone, now);
  const log = (event: Omit<Parameters<typeof newLedgerEvent>[0], "workspaceId" | "actor">) =>
    logLedgerEvent(supabase, newLedgerEvent({ workspaceId, actor: callerHash, ...event }));

  // Dedupe: one text-back per caller per 4 hours.
  const dedupeSince = new Date(now.getTime() - TEXTBACK_DEDUPE_MS).toISOString();
  if (await ledgerHasRecentAction(supabase, workspaceId, callerHash, "textback_sent", dedupeSince)) {
    await log({
      action: "textback_deduped",
      inputHash: sha256Hex(`textback:${callRef}`),
      evidenceRefs: [callRef],
    });
    return { sent: false, reason: "deduped" };
  }

  if (await isSuppressed(supabase, workspaceId, to)) {
    await log({
      action: "textback_suppressed",
      inputHash: sha256Hex(`textback:${callRef}`),
      evidenceRefs: [callRef],
    });
    return { sent: false, reason: "suppressed" };
  }

  // Quiet hours: defer; the sweep sends at 08:00 local. The caller's phone
  // is kept in evidenceRefs[1] so the sweep can send without a webhook
  // audit row (AgentPhone has no voice-callback audit table on our side).
  if (isQuietHours(localMinutes)) {
    await log({
      action: "textback_deferred",
      inputHash: sha256Hex(`textback:${callRef}`),
      evidenceRefs: [callRef, to],
    });
    return { sent: false, reason: "deferred" };
  }

  const gate = await textBackSendGate({ workspaceId, localTimeMinutes: localMinutes });
  if (!gate.passed) {
    await log({
      action: "textback_blocked",
      inputHash: sha256Hex(`textback:${callRef}`),
      evidenceRefs: [callRef, gate.reason],
    });
    return { sent: false, reason: "blocked" };
  }

  const body = renderTemplate(TEXTBACK_TEMPLATE, { businessName: profile.businessName });
  const sent = await sendShopSms(supabase, sender, {
    workspaceId,
    to,
    body,
    idempotencyKey: `textback:${callRef}`,
    templateKey: "shop_agent.textback",
    metadata: { call_ref: callRef, source: req.source },
  });
  await log({
    action: "textback_sent",
    inputHash: sha256Hex(`textback:${callRef}`),
    outputHash: sha256Hex(body),
    evidenceRefs: [callRef, sent.providerMessageId],
  });
  return { sent: true, providerMessageId: sent.providerMessageId };
}

/** Convenience: load the profile and send the text-back in one call. */
export async function sendMissedCallTextBackForWorkspace(
  supabase: ShopAgentSupabase,
  sender: ShopSmsSender,
  input: { workspaceId: string; to: string; callRef: string; source: TextBackRequest["source"] },
  opts?: { now?: Date },
): Promise<TextBackOutcome> {
  const profile = await getShopProfile(supabase, input.workspaceId);
  return sendMissedCallTextBack(
    supabase,
    sender,
    { workspaceId: input.workspaceId, to: input.to, callRef: input.callRef, profile, source: input.source },
    opts,
  );
}
