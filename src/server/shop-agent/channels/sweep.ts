/**
 * Shop Agent Phase 1 — scheduled sweep (provider-agnostic).
 *
 * (a) Deferred text-backs whose quiet hours have passed: re-runs the shared
 *     text-back flow (which re-checks dedupe/suppression/gate, so the sweep
 *     is idempotent).
 * (b) One follow-up nudge per conversation: text-back sent > 2h ago, no
 *     customer reply in the last 2h, memory state still
 *     greeted/need_identified, and no nudge sent yet. Never a third nudge.
 *
 * The sender is injected per workspace (AgentPhone agent_id differs per
 * workspace) via `senderFor`. SMS content/policies are unchanged from the
 * Phase 1 brief — only the event source and send API changed.
 */
import { isQuietHours } from "../zeroai/policy";
import { checkGate } from "../zeroai/gates";
import { loadMemory } from "../zeroai/memory";
import type { SupabaseMemoryClient } from "../zeroai/memory";
import { currentLocalMinutes, getShopProfile } from "../profile";
import { sha256Hex } from "../zeroai/types";
import type { ShopProfile } from "../zeroai/types";
import type { ShopAgentSupabase } from "./db";
import { logLedgerEvent, newLedgerEvent } from "./ledger-events";
import { sendShopSms } from "./sending";
import type { ShopSmsSender } from "./sending";
import { isSuppressed } from "./suppressions";
import { NUDGE_TEMPLATE } from "./templates";
import { ledgerHasRecentAction, sendMissedCallTextBack } from "./textback";
import type { TextBackOutcome } from "./textback";

const NUDGE_DELAY_MS = 2 * 60 * 60 * 1000;
const SWEEP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface SweepDeps {
  now?: Date;
  /** Resolve a sender for a workspace (null = skip; e.g. provider not configured). */
  senderFor: (workspaceId: string) => Promise<ShopSmsSender | null>;
}

export interface SweepResult {
  deferredSent: number;
  deferredSkipped: number;
  nudgesSent: number;
  nudgesSkipped: number;
}

interface SweepLedgerRow {
  workspace_id: string;
  actor: string;
  evidence?: { evidenceRefs?: string[] };
  occurred_at: string;
}

export async function sweepDueActions(
  supabase: ShopAgentSupabase,
  deps: SweepDeps,
): Promise<SweepResult> {
  const now = deps.now ?? new Date();
  const result: SweepResult = { deferredSent: 0, deferredSkipped: 0, nudgesSent: 0, nudgesSkipped: 0 };
  const since24h = new Date(now.getTime() - SWEEP_LOOKBACK_MS).toISOString();
  const twoHoursAgo = new Date(now.getTime() - NUDGE_DELAY_MS).toISOString();
  const profileCache = new Map<string, ShopProfile | null>();

  async function cachedProfile(workspaceId: string): Promise<ShopProfile | null> {
    if (!profileCache.has(workspaceId)) {
      try {
        profileCache.set(workspaceId, await getShopProfile(supabase, workspaceId));
      } catch {
        profileCache.set(workspaceId, null);
      }
    }
    return profileCache.get(workspaceId) ?? null;
  }

  async function quietNow(profile: ShopProfile): Promise<boolean> {
    return isQuietHours(currentLocalMinutes(profile.hours.timezone || "UTC", now));
  }

  // (a) Deferred text-backs whose quiet hours have passed.
  const { data: deferred, error: deferredError } = await supabase
    .from("shop_agent_ledger")
    .select("workspace_id,actor,evidence,occurred_at")
    .eq("action", "textback_deferred")
    .gte("occurred_at", since24h)
    .order("occurred_at", { ascending: true })
    .limit(200);
  if (deferredError) throw deferredError;

  for (const event of (deferred ?? []) as SweepLedgerRow[]) {
    const workspaceId = event.workspace_id;
    const callerHash = event.actor;
    const callRef = event.evidence?.evidenceRefs?.[0];
    const phone = event.evidence?.evidenceRefs?.[1];
    const sender = await deps.senderFor(workspaceId);
    const profile = await cachedProfile(workspaceId);
    if (!sender || !profile || !phone) {
      result.deferredSkipped += 1;
      continue;
    }
    if (await quietNow(profile)) {
      result.deferredSkipped += 1;
      continue;
    }
    const outcome = await sendMissedCallTextBack(
      supabase,
      sender,
      {
        workspaceId,
        to: phone,
        callRef: callRef ?? `sweep-${Date.now()}`,
        profile,
        source: "sweep_deferred",
      },
      { now },
    );
    if (outcome.sent) {
      result.deferredSent += 1;
    } else {
      // The shared flow already logged the specific reason
      // (deduped/suppressed/blocked); a re-deferral just waits.
      // Note: Extract (not narrowing) — the repo runs with strictNullChecks
      // off, which disables discriminated-union narrowing.
      const reason = (outcome as Extract<TextBackOutcome, { sent: false }>).reason;
      if (reason !== "deferred") {
        await logLedgerEvent(
          supabase,
          newLedgerEvent({
            workspaceId,
            actor: callerHash,
            action: "textback_deferred_unresolved",
            inputHash: sha256Hex(`sweep:${callRef ?? "unknown"}`),
            evidenceRefs: callRef ? [callRef] : [],
          }),
        );
      }
      result.deferredSkipped += 1;
    }
  }

  // (b) One follow-up nudge per silent conversation.
  const { data: sentEvents, error: sentError } = await supabase
    .from("shop_agent_ledger")
    .select("workspace_id,actor,evidence,occurred_at")
    .eq("action", "textback_sent")
    .gte("occurred_at", since24h)
    .order("occurred_at", { ascending: true })
    .limit(200);
  if (sentError) throw sentError;

  for (const event of (sentEvents ?? []) as SweepLedgerRow[]) {
    const workspaceId = event.workspace_id;
    const callerHash = event.actor;
    const callRef = event.evidence?.evidenceRefs?.[0];
    if (event.occurred_at > twoHoursAgo) {
      result.nudgesSkipped += 1;
      continue;
    }
    if (await ledgerHasRecentAction(supabase, workspaceId, callerHash, "nudge_sent", event.occurred_at)) {
      result.nudgesSkipped += 1;
      continue;
    }
    let state = "greeted";
    try {
      const mem = await loadMemory(
        supabase as unknown as SupabaseMemoryClient,
        workspaceId,
        callerHash,
      );
      state = mem?.state ?? "greeted";
    } catch {
      state = "greeted";
    }
    if (state !== "greeted" && state !== "need_identified") {
      result.nudgesSkipped += 1;
      continue;
    }
    // Resolve the phone via the text-back's message_logs row (or the
    // deferred event's evidence when the text-back came from the sweep).
    const phone = await resolveNudgePhone(supabase, workspaceId, callRef);
    if (!phone) {
      result.nudgesSkipped += 1;
      continue;
    }
    const { data: replies, error: repliesError } = await supabase
      .from("inbound_messages")
      .select("received_at")
      .eq("workspace_id", workspaceId)
      .eq("from_address", phone)
      .gte("received_at", event.occurred_at)
      .order("received_at", { ascending: false })
      .limit(1);
    if (repliesError) throw repliesError;
    const lastReply = (replies as Array<{ received_at: string }> | null)?.[0]?.received_at;
    if (lastReply && lastReply > twoHoursAgo) {
      result.nudgesSkipped += 1;
      continue;
    }
    const profile = await cachedProfile(workspaceId);
    const sender = await deps.senderFor(workspaceId);
    if (!profile || !sender) {
      result.nudgesSkipped += 1;
      continue;
    }
    if (await quietNow(profile)) {
      result.nudgesSkipped += 1;
      continue;
    }
    if (await isSuppressed(supabase, workspaceId, phone)) {
      result.nudgesSkipped += 1;
      continue;
    }
    const gate = await checkGate("policy_check", {
      policyAction: "send_message",
      policyCtx: {
        workspaceId,
        localTimeMinutes: currentLocalMinutes(profile.hours.timezone || "UTC", now),
        optedOut: false,
      },
    });
    if (!gate.passed) {
      result.nudgesSkipped += 1;
      continue;
    }
    const sent = await sendShopSms(supabase, sender, {
      workspaceId,
      to: phone,
      body: NUDGE_TEMPLATE,
      idempotencyKey: `nudge:${callRef ?? callerHash}`,
      templateKey: "shop_agent.nudge",
      metadata: { call_ref: callRef ?? "", source: "sweep_nudge" },
    });
    await logLedgerEvent(
      supabase,
      newLedgerEvent({
        workspaceId,
        actor: callerHash,
        action: "nudge_sent",
        inputHash: sha256Hex(`nudge:${callRef ?? callerHash}`),
        outputHash: sha256Hex(NUDGE_TEMPLATE),
        evidenceRefs: [callRef ?? "", sent.providerMessageId],
      }),
    );
    result.nudgesSent += 1;
  }

  return result;
}

async function resolveNudgePhone(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  callRef: string | undefined,
): Promise<string | null> {
  if (callRef) {
    const { data, error } = await supabase
      .from("message_logs")
      .select("recipient_phone")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", `textback:${callRef}`)
      .maybeSingle();
    if (error) throw error;
    const phone = data?.recipient_phone as string | undefined;
    if (phone) return phone;
  }
  return null;
}
