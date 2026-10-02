/**
 * Shop Agent Phase 1 — AgentPhone webhook dispatcher.
 *
 * Events (verified 2026-10-01):
 * - `agent.message`, channel sms|mms|imessage, inbound direction → the
 *   existing processInboundSms conversation pipeline.
 * - `agent.message`, channel voice → Phase 1: a deterministic holding line
 *   (NO model in the voice path; full voice is Phase 2). The response must
 *   be JSON with a `text` field.
 * - `agent.call_ended`, channel voice → missed-call determination via
 *   isMissedCall() → the shared text-back flow (4h dedupe, suppression,
 *   quiet-hours deferral, policy gate, ledger).
 * - `agent.reaction` / unknown → ledger `webhook_ignored` + 200.
 *
 * Workspace resolution: `provider_connections` rows with
 * provider='agentphone' and metadata {agent_id, number_id, inbound_number};
 * lookup is metadata->>'inbound_number' = To (mirrors the existing Twilio
 * provider_connections pattern), falling back to metadata->>'agent_id'.
 * Setup must insert one row per workspace — no schema change.
 */
import { AgentPhoneAdapter, isMissedCall } from "../agentphone";
import type { NormalizedAgentPhoneEvent } from "../agentphone";
import { getShopProfile } from "../profile";
import { sha256Hex } from "../zeroai/types";
import type { ModelReasoner } from "../zeroai/types";
import type { ShopAgentSupabase } from "./db";
import { logLedgerEvent, newLedgerEvent } from "./ledger-events";
import type { ShopSmsSender } from "./sending";
import { callerHashFor, sendMissedCallTextBackForWorkspace } from "./textback";
import { processInboundSms } from "./sms";

export const VOICE_HOLDING_LINE_TEMPLATE =
  "Thanks for calling {businessName} — I'll text you right now so we can help faster.";

export interface AgentPhoneWebhookDeps {
  supabase: ShopAgentSupabase;
  /** Resolve a sender for a workspace (null = provider not configured). */
  senderFor: (workspaceId: string) => Promise<ShopSmsSender | null>;
  /** Null until app bootstrap injects the model adapter via setShopAgentReasoner(). */
  reasoner: ModelReasoner | null;
}

export type AgentPhoneWebhookBody = { ok: true } | { text: string };

export interface AgentPhoneWebhookResult {
  body: AgentPhoneWebhookBody;
}

interface ResolvedWorkspace {
  workspaceId: string;
  agentId?: string;
  numberId?: string;
}

async function resolveWorkspace(
  supabase: ShopAgentSupabase,
  event: NormalizedAgentPhoneEvent,
): Promise<ResolvedWorkspace | null> {
  // Primary: the number that was contacted (mirrors the Twilio
  // findWorkspaceByDestination pattern).
  if (event.to) {
    const { data, error } = await supabase
      .from("provider_connections")
      .select("workspace_id,metadata")
      .eq("provider", "agentphone")
      .contains("metadata", { inbound_number: event.to })
      .maybeSingle();
    if (error) throw error;
    if (data?.workspace_id) {
      const metadata = (data.metadata ?? {}) as Record<string, unknown>;
      return {
        workspaceId: data.workspace_id as string,
        agentId: typeof metadata.agent_id === "string" ? metadata.agent_id : event.agentId,
        numberId: typeof metadata.number_id === "string" ? metadata.number_id : event.numberId,
      };
    }
  }
  // Fallback: the agent that emitted the event.
  if (event.agentId) {
    const { data, error } = await supabase
      .from("provider_connections")
      .select("workspace_id,metadata")
      .eq("provider", "agentphone")
      .contains("metadata", { agent_id: event.agentId })
      .maybeSingle();
    if (error) throw error;
    if (data?.workspace_id) {
      const metadata = (data.metadata ?? {}) as Record<string, unknown>;
      return {
        workspaceId: data.workspace_id as string,
        agentId: event.agentId,
        numberId: typeof metadata.number_id === "string" ? metadata.number_id : event.numberId,
      };
    }
  }
  return null;
}

/**
 * Build an AgentPhoneAdapter for a workspace from its provider_connections
 * metadata. Returns null when the provider is not configured (fail-closed:
 * callers skip the send and count it as skipped).
 */
export async function resolveAgentPhoneSender(
  supabase: ShopAgentSupabase,
  workspaceId: string,
): Promise<AgentPhoneAdapter | null> {
  const apiKey = process.env.AGENTPHONE_API_KEY?.trim();
  if (!apiKey) {
    console.error("[agentphone] AGENTPHONE_API_KEY is not configured — skipping send (fail closed).");
    return null;
  }
  const { data, error } = await supabase
    .from("provider_connections")
    .select("metadata")
    .eq("provider", "agentphone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const agentId = typeof metadata.agent_id === "string" ? metadata.agent_id : undefined;
  const numberId = typeof metadata.number_id === "string" ? metadata.number_id : undefined;
  if (!agentId) {
    console.error("[agentphone] no agent_id in provider_connections metadata — skipping send.", {
      workspaceId,
    });
    return null;
  }
  return new AgentPhoneAdapter({ apiKey, agentId, numberId });
}

export async function handleAgentPhoneWebhook(
  deps: AgentPhoneWebhookDeps,
  payload: unknown,
  headerEvent?: string | null,
  opts?: { now?: Date },
): Promise<AgentPhoneWebhookResult> {
  const { supabase } = deps;
  const now = opts?.now ?? new Date();
  const event: NormalizedAgentPhoneEvent = AgentPhoneAdapter.normalizeInboundEvent(
    payload,
    headerEvent,
  );

  const workspace = await resolveWorkspace(supabase, event);
  const log = async (
    workspaceId: string,
    actor: string,
    action: string,
    inputHash: string,
    evidenceRefs: string[] = [],
  ) =>
    logLedgerEvent(
      supabase,
      newLedgerEvent({ workspaceId, actor, action, inputHash, evidenceRefs }),
    );

  // Unknown / reaction events: audit when we can attribute a workspace.
  if (event.eventType === "unknown" || event.eventType === "agent.reaction") {
    if (workspace) {
      await log(
        workspace.workspaceId,
        "agentphone",
        "webhook_ignored",
        sha256Hex(`webhook_ignored:${JSON.stringify(payload).slice(0, 120)}`),
        [event.eventType],
      );
    }
    return { body: { ok: true } };
  }

  if (!workspace) {
    console.error("[agentphone] webhook for unknown workspace — no provider_connections row.", {
      to: event.to,
      agentId: event.agentId,
    });
    return { body: { ok: true } };
  }
  const { workspaceId } = workspace;

  // --- agent.message, text channels, inbound → conversation pipeline ---
  if (
    event.eventType === "agent.message" &&
    (event.channel === "sms" || event.channel === "mms" || event.channel === "imessage")
  ) {
    if (event.direction === "outbound") {
      // Our own sends echoed back — never feed them to the pipeline.
      await log(workspaceId, "agentphone", "webhook_ignored", sha256Hex(`echo:${event.conversationId ?? ""}`), [
        "outbound-echo",
      ]);
      return { body: { ok: true } };
    }
    if (!event.from || !event.body) {
      await log(workspaceId, "agentphone", "webhook_ignored", sha256Hex(`empty:${Date.now()}`), [
        "missing-from-or-body",
      ]);
      return { body: { ok: true } };
    }
    if (!deps.reasoner) {
      await log(
        workspaceId,
        callerHashFor(event.from),
        "pipeline_skipped_no_reasoner",
        sha256Hex(`noreasoner:${event.from}:${event.body}`),
      );
      return { body: { ok: true } };
    }
    const sender = await deps.senderFor(workspaceId);
    if (!sender) {
      await log(
        workspaceId,
        callerHashFor(event.from),
        "pipeline_skipped_no_sender",
        sha256Hex(`nosender:${event.from}`),
      );
      return { body: { ok: true } };
    }
    // Fire-and-forget is the route's choice; here we await so tests and
    // direct callers observe the outcome.
    await processInboundSms(
      { supabase, smsAdapter: sender, reasoner: deps.reasoner },
      { workspaceId, from: event.from, body: event.body },
      { now },
    );
    return { body: { ok: true } };
  }

  // --- agent.message, voice → Phase 1 holding line (no model) ---
  if (event.eventType === "agent.message" && event.channel === "voice") {
    const profile = await getShopProfile(supabase, workspaceId);
    const text = VOICE_HOLDING_LINE_TEMPLATE.replace("{businessName}", profile.businessName);
    await log(
      workspaceId,
      event.from ? callerHashFor(event.from) : "agentphone",
      "voice_turn_held",
      sha256Hex(`voice:${event.conversationId ?? event.callId ?? Date.now()}`),
      [event.conversationId ?? "", event.callId ?? ""],
    );
    return { body: { text } };
  }

  // --- agent.call_ended → missed-call text-back when missed ---
  if (event.eventType === "agent.call_ended") {
    const data = {
      transcript: event.transcript,
      durationSeconds: event.durationSeconds,
      status: event.status,
      answered: event.answered,
    };
    const callRef = event.callId ?? event.conversationId ?? `call-${Date.now()}`;
    if (!isMissedCall(data)) {
      await log(
        workspaceId,
        event.from ? callerHashFor(event.from) : "agentphone",
        "call_answered_or_ignored",
        sha256Hex(`call:${callRef}`),
        [callRef],
      );
      return { body: { ok: true } };
    }
    const from = event.from;
    if (!from) {
      // Defensive: the documented call_ended shape has no from/to fields.
      // Without a caller number there is nobody to text.
      await log(workspaceId, "agentphone", "call_ended_unresolved", sha256Hex(`call:${callRef}`), [
        callRef,
      ]);
      return { body: { ok: true } };
    }
    const sender = await deps.senderFor(workspaceId);
    if (!sender) {
      await log(workspaceId, callerHashFor(from), "textback_skipped_no_sender", sha256Hex(`call:${callRef}`), [
        callRef,
      ]);
      return { body: { ok: true } };
    }
    await sendMissedCallTextBackForWorkspace(
      supabase,
      sender,
      { workspaceId, to: from, callRef, source: "call_ended" },
      { now },
    );
    return { body: { ok: true } };
  }

  return { body: { ok: true } };
}
