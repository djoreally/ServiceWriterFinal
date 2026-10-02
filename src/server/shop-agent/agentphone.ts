/**
 * Shop Agent — AgentPhone provider adapter (Phase 1).
 *
 * AgentPhone (https://docs.agentphone.ai/welcome) is the telephony home for
 * the Shop Agent: SMS + voice numbers with webhooks. In ZeroAI terms it is an
 * Execution Plane adapter — control (taskgraph), policy, ledger, and memory
 * stay in our runtime. Voice runs in **webhook mode** (our endpoint decides
 * every turn); the account's starter agent is in hosted mode — do not use it.
 *
 * Verified facts (live credential test 2026-10-01, see
 * ~/workspace/skills/agentphone/SKILL.md):
 * - Base `https://api.agentphone.ai/v1`, auth `Authorization: Bearer <key>`
 *   from env `AGENTPHONE_API_KEY`. Fail closed when absent.
 * - **No sandbox / test mode — every SMS/call bills real money.** Tests mock
 *   the HTTP boundary (inject `fetchImpl`); never place a real call or send a
 *   real SMS from tests or dev scripts.
 * - Outbound SMS to US numbers requires 10DLC registration ($25 one-time);
 *   inbound SMS works immediately. Provider 4xx errors are surfaced with
 *   their message intact so a 10DLC rejection is diagnosable.
 * - Webhook signature: `X-Webhook-Signature: sha256=<hex>` over
 *   `"{timestamp}.{raw_body}"` (X-Webhook-Timestamp value + "." + raw body
 *   bytes), HMAC-SHA256 with the webhook secret, hex-encoded. Reject
 *   timestamps outside a 5-minute window (replay protection).
 * - Their API documents NO idempotency key on POST /v1/messages — our
 *   ledger-based dedupe (textback_sent / sms_received entries) is the
 *   idempotency story. Flagged, not worked around.
 *
 * The `agentphone` skill (~/workspace/skills/agentphone/) is for
 * OPERATOR-side use (CLI with the stored credential). App code here reads
 * `AGENTPHONE_API_KEY` from env at runtime and never shells out to the skill.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const AGENTPHONE_API_BASE = "https://api.agentphone.ai/v1";
export const AGENTPHONE_API_KEY_ENV = "AGENTPHONE_API_KEY";
export const AGENTPHONE_WEBHOOK_SECRET_ENV = "AGENTPHONE_WEBHOOK_SECRET";

/** Verified header names (live test 2026-10-01). */
export const AGENTPHONE_SIGNATURE_HEADER = "x-webhook-signature";
export const AGENTPHONE_TIMESTAMP_HEADER = "x-webhook-timestamp";
export const AGENTPHONE_ID_HEADER = "x-webhook-id";
export const AGENTPHONE_EVENT_HEADER = "x-webhook-event";

/** Replay-protection window for webhook timestamps. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface AgentPhoneAdapterOptions {
  apiKey?: string;
  /** Default agent for outbound sends (per-workspace agent_id also accepted per send). */
  agentId?: string;
  /** Default number_id for outbound sends. */
  numberId?: string;
  /** Injectable fetch for tests — never hits the network when stubbed. */
  fetchImpl?: typeof fetch;
}

export interface AgentPhoneSendResult {
  providerMessageId: string;
  providerName: "agentphone";
  status: "queued" | "accepted" | "sent";
  acceptedAt: string;
}

function setupError(message: string): Error {
  return new Error(`[agentphone] ${message}`);
}

export class AgentPhoneAdapter {
  readonly providerName = "agentphone" as const;
  private readonly apiKey: string;
  private readonly defaultAgentId?: string;
  private readonly defaultNumberId?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AgentPhoneAdapterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env[AGENTPHONE_API_KEY_ENV]?.trim();
    if (!apiKey) {
      throw setupError(
        `${AGENTPHONE_API_KEY_ENV} is not configured — set it in the environment; ` +
          `refusing to construct the adapter without a credential (fail closed).`,
      );
    }
    this.apiKey = apiKey;
    this.defaultAgentId = opts.agentId;
    this.defaultNumberId = opts.numberId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${AGENTPHONE_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      id?: string;
      [key: string]: unknown;
    };
    if (!response.ok) {
      // Surface the provider message intact — a 10DLC rejection (outbound US
      // SMS requires 10DLC registration, $25 one-time) must be diagnosable,
      // never swallowed.
      const detail =
        typeof payload.message === "string" && payload.message
          ? payload.message
          : typeof payload.error === "string" && payload.error
            ? payload.error
            : `HTTP ${response.status}`;
      throw setupError(`request failed (${method} ${path}): ${detail}`);
    }
    return payload as T;
  }

  /**
   * Send an SMS via POST /v1/messages.
   *
   * NOTE: AgentPhone documents no idempotency key on this endpoint — every
   * call bills real money and a retry sends a duplicate. Our ledger-based
   * dedupe (one textback_sent / sms_received entry per event) is the
   * idempotency story: the channel layer never retries a send that already
   * has a ledger entry.
   *
   * NOTE: outbound SMS to US numbers requires 10DLC registration ($25
   * one-time); until then the provider returns a 4xx which is surfaced above.
   */
  async sendSms(input: {
    to: string;
    body: string;
    agentId?: string;
    numberId?: string;
    /** Accepted for the provider-agnostic sender interface; not sent (no provider idempotency). */
    idempotencyKey?: string;
    /** Accepted for the provider-agnostic sender interface; audit-only. */
    templateKey?: string;
    metadata?: Record<string, string>;
  }): Promise<AgentPhoneSendResult> {
    const agentId = input.agentId ?? this.defaultAgentId;
    if (!agentId) {
      throw setupError("agent_id is required to send — pass it per send or in the constructor.");
    }
    const payload = await this.request<Record<string, unknown>>("POST", "/messages", {
      agent_id: agentId,
      to_number: input.to,
      body: input.body,
      ...(input.numberId ?? this.defaultNumberId
        ? { number_id: input.numberId ?? this.defaultNumberId }
        : {}),
    });
    const id =
      typeof payload.id === "string"
        ? payload.id
        : typeof payload.message_id === "string"
          ? (payload.message_id as string)
          : `ap-${Date.now()}`;
    return {
      providerMessageId: id,
      providerName: this.providerName,
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Webhook signature verification (verified scheme, live test 2026-10-01)
  // -----------------------------------------------------------------------

  /**
   * Verify an AgentPhone webhook request.
   *
   * expected = hex(HMAC-SHA256(webhook_secret, "{timestamp}.{raw_body}"));
   * accept only when the signature header equals `sha256=<expected>` under a
   * timing-safe compare AND the timestamp is within 5 minutes of now.
   * The timestamp may be seconds or milliseconds — both are accepted.
   */
  static verifyWebhookSignature(
    secret: string,
    rawBody: string,
    signatureHeader: string | null | undefined,
    timestampHeader: string | null | undefined,
  ): boolean {
    if (!secret || !signatureHeader || !timestampHeader) return false;
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) return false;
    const nowMs = Date.now();
    const tsMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
    if (Math.abs(nowMs - tsMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) return false;
    const signed = `${timestampHeader}.${rawBody}`;
    const expectedHex = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
    const expected = `sha256=${expectedHex}`;
    const left = Buffer.from(signatureHeader);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  verifyWebhook(
    secret: string,
    rawBody: string,
    signatureHeader: string | null | undefined,
    timestampHeader: string | null | undefined,
  ): boolean {
    return AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, signatureHeader, timestampHeader);
  }

  // -----------------------------------------------------------------------
  // Inbound event normalization
  // -----------------------------------------------------------------------

  normalizeInbound(payload: unknown, headerEvent?: string | null): NormalizedAgentPhoneEvent {
    return AgentPhoneAdapter.normalizeInboundEvent(payload, headerEvent);
  }

  static normalizeInboundEvent(
    payload: unknown,
    headerEvent?: string | null,
  ): NormalizedAgentPhoneEvent {
    const raw = (payload ?? {}) as Record<string, unknown>;
    const eventType = normalizeEventType(
      headerEvent ?? (raw.event as string | undefined) ?? (raw.type as string | undefined),
    );
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const channel = normalizeChannel(raw.channel);
    return {
      eventType,
      channel,
      direction: normalizeDirection(data.direction),
      from: str(data.from) ?? str(data.callerNumber) ?? str(data.caller),
      to: str(data.to) ?? str(data.calleeNumber) ?? str(data.callee),
      body: str(data.message) ?? str(data.transcript) ?? str(data.text),
      agentId: str(raw.agentId) ?? str(raw.agent_id) ?? str(data.agentId),
      numberId: str(data.numberId) ?? str(data.number_id),
      conversationId: str(data.conversationId) ?? str(data.conversation_id),
      callId: str(data.callId) ?? str(data.call_id),
      durationSeconds: num(data.durationSeconds) ?? num(data.duration_seconds),
      transcript: str(data.transcript),
      summary: str(data.summary),
      userSentiment: str(data.userSentiment) ?? str(data.user_sentiment),
      status: str(data.status),
      answered: typeof data.answered === "boolean" ? data.answered : undefined,
      raw: payload,
    };
  }

  // -----------------------------------------------------------------------
  // Setup helpers (runbook use — never called at request time)
  // -----------------------------------------------------------------------

  /**
   * Create the shop's agent IN WEBHOOK MODE (our backend controls every
   * turn). Do NOT use the account's starter agent (hosted mode).
   */
  async createAgent(input: {
    name: string;
    systemPrompt?: string;
    beginMessage?: string;
    voice?: string;
  }): Promise<{ id: string; [key: string]: unknown }> {
    const created = await this.request<Record<string, unknown>>("POST", "/agents", {
      name: input.name,
      voiceMode: "webhook",
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.beginMessage ? { beginMessage: input.beginMessage } : {}),
      ...(input.voice ? { voice: input.voice } : {}),
    });
    const id = created.id;
    if (typeof id !== "string") throw setupError("createAgent returned no id");
    return { ...created, id };
  }

  async provisionNumber(input: {
    country?: string;
    areaCode?: string;
    agentId?: string;
  }): Promise<{ id: string; number: string; [key: string]: unknown }> {
    const provisioned = await this.request<Record<string, unknown>>("POST", "/numbers", {
      country: input.country ?? "US",
      ...(input.areaCode ? { areaCode: input.areaCode } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
    });
    const id = provisioned.id;
    if (typeof id !== "string") throw setupError("provisionNumber returned no id");
    return { ...provisioned, id, number: str(provisioned.number) ?? "" };
  }

  async attachNumber(agentId: string, numberId: string): Promise<unknown> {
    return this.request("POST", `/agents/${agentId}/numbers`, { numberId });
  }

  /**
   * Register the webhook URL. The response includes the signing `secret` —
   * store it as AGENTPHONE_WEBHOOK_SECRET (never log it).
   */
  async setWebhook(url: string, agentId?: string): Promise<{ secret?: string; [key: string]: unknown }> {
    const path = agentId ? `/agents/${agentId}/webhook` : "/webhooks";
    return this.request("POST", path, { url });
  }

  async testWebhook(): Promise<unknown> {
    return this.request("POST", "/webhooks/test", {});
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export type AgentPhoneEventType = "agent.message" | "agent.call_ended" | "agent.reaction" | "unknown";
export type AgentPhoneChannel = "sms" | "mms" | "imessage" | "voice" | undefined;

export interface NormalizedAgentPhoneEvent {
  eventType: AgentPhoneEventType;
  channel: AgentPhoneChannel;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
  body?: string;
  agentId?: string;
  numberId?: string;
  conversationId?: string;
  callId?: string;
  durationSeconds?: number;
  transcript?: string;
  summary?: string;
  userSentiment?: string;
  /** Defensive: explicit answered/unanswered signals when the provider sends them. */
  status?: string;
  answered?: boolean;
  raw: unknown;
}

function normalizeEventType(value: string | undefined): AgentPhoneEventType {
  const v = (value ?? "").toLowerCase().trim();
  if (v === "agent.message") return "agent.message";
  if (v === "agent.call_ended") return "agent.call_ended";
  if (v === "agent.reaction") return "agent.reaction";
  return "unknown";
}

function normalizeChannel(value: unknown): AgentPhoneChannel {
  const v = String(value ?? "").toLowerCase();
  if (v === "sms" || v === "mms" || v === "imessage" || v === "voice") return v;
  return undefined;
}

function normalizeDirection(value: unknown): "inbound" | "outbound" | undefined {
  const v = String(value ?? "").toLowerCase();
  if (["inbound", "incoming", "in"].includes(v)) return "inbound";
  if (["outbound", "outgoing", "out"].includes(v)) return "outbound";
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Missed-call determination for `agent.call_ended`.
 *
 * ASSUMPTION (documented): AgentPhone's docs do not define an explicit
 * "missed" signal on call_ended, so this checks every plausible variant —
 * an explicit unanswered-ish status, answered === false, an empty/missing
 * transcript, or a very short call (< 10s, consistent with the Phase 1
 * text-back brief). Unit-tested per variant; revisit against live payloads
 * during dogfood and tighten if the provider documents a canonical field.
 */
export function isMissedCall(data: {
  transcript?: string | null;
  durationSeconds?: number | null;
  status?: string | null;
  answered?: boolean | null;
}): boolean {
  const status = (data.status ?? "").toLowerCase().replace(/[_\s]+/g, "-");
  if (
    ["no-answer", "busy", "failed", "canceled", "cancelled", "missed", "unanswered"].includes(status)
  ) {
    return true;
  }
  if (data.answered === false) return true;
  if (!data.transcript || !data.transcript.trim()) return true;
  if (typeof data.durationSeconds === "number" && data.durationSeconds < 10) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Local-dev stub (never touches the network — mirrors the Twilio discipline)
// ---------------------------------------------------------------------------

export interface StubSentMessage {
  to: string;
  body: string;
  agentId?: string;
  numberId?: string;
  idempotencyKey?: string;
  templateKey?: string;
}

/**
 * In-memory stand-in for AgentPhoneAdapter for local dev and tests.
 * Captures sends; verifyWebhookSignature always uses the static verifier.
 */
export class StubAgentPhoneAdapter {
  readonly providerName = "agentphone" as const;
  readonly sent: StubSentMessage[] = [];
  constructor(private readonly opts: { agentId?: string; numberId?: string } = {}) {}

  async sendSms(input: {
    to: string;
    body: string;
    agentId?: string;
    numberId?: string;
    idempotencyKey?: string;
    templateKey?: string;
    metadata?: Record<string, string>;
  }): Promise<AgentPhoneSendResult> {
    const record: StubSentMessage = {
      to: input.to,
      body: input.body,
      agentId: input.agentId ?? this.opts.agentId,
      numberId: input.numberId ?? this.opts.numberId,
      idempotencyKey: input.idempotencyKey,
      templateKey: input.templateKey,
    };
    this.sent.push(record);
    return {
      providerMessageId: `stub-sm-${this.sent.length}`,
      providerName: this.providerName,
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    };
  }
}
