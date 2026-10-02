/**
 * ZeroAI model boundary — provider-backed reasoner (Phase 1).
 *
 * "Inference proposes. Deterministic systems decide."
 *
 * ProviderReasoner is the ONLY reasoner that calls a model. Every guardrail
 * here is deterministic code, never prompt engineering:
 *  - request timeout (~20s) → handoff
 *  - max output tokens cap
 *  - per-conversation turn cap (~12) → handoff
 *  - output MUST parse as JSON and validate against the task graph
 *    (legal ConversationState + legal transition from the current state);
 *    anything else → handoff, never proceed
 *  - token usage captured for the ZeroCert cost story (returned on the
 *    output; the pipeline writes it to the ledger)
 *
 * Prompt assembly uses ONLY the allowed projection: registry instruction
 * set + intent contract + memory projection (facts + summary) + shop
 * profile. NEVER raw transcripts, NEVER the caller's raw phone number —
 * the pipeline never passes them in, and the assembly below does not
 * reach for anything outside ReasonInput.
 */
import { transition } from "./taskgraph";
import { MAX_SMS_CHARS } from "./registry";
import { chatCompletion } from "./providers";
import type { ModelProviderName } from "./providers";
import { NoopReasoner, NOOP_HANDOFF_MESSAGE } from "./reasoners";
import type {
  ConversationFacts,
  ConversationState,
  ModelReasoner,
  ModelUsage,
  ReasonInput,
  ReasonOutput,
  ShopProfile,
} from "./types";
import { PROVIDER_WIRES } from "./providers";

export const SHOP_AGENT_MODEL_PROVIDER_ENV = "SHOP_AGENT_MODEL_PROVIDER";
export const SHOP_AGENT_MODEL_API_KEY_ENV = "SHOP_AGENT_MODEL_API_KEY";
export const SHOP_AGENT_MODEL_NAME_ENV = "SHOP_AGENT_MODEL_NAME";

/** Request budget: an SMS turn must resolve in seconds, not minutes. */
export const MODEL_TIMEOUT_MS = 20_000;
/** SMS replies are short; cap output hard. */
export const MODEL_MAX_OUTPUT_TOKENS = 300;
/** Conversations that run long go to a human, not in circles. */
export const MODEL_MAX_TURNS = 12;
/** Low-temperature: deterministic shop-voice replies, not creative writing. */
export const MODEL_TEMPERATURE = 0.2;

const VALID_STATES: ConversationState[] = [
  "greeted",
  "need_identified",
  "vehicle_known",
  "slot_offered",
  "booked",
  "callback_requested",
  "handed_off",
  "closed",
];

/** Only these fact keys may come back from the model; the rest is dropped. */
const FACT_KEYS = new Set<keyof ConversationFacts>([
  "need",
  "serviceId",
  "serviceName",
  "vehicleYear",
  "vehicleMake",
  "vehicleModel",
  "vehicleMileage",
  "customerName",
  "customerId",
  "callbackReason",
  "handoffReason",
]);

export interface ProviderReasonerOptions {
  provider: ModelProviderName;
  apiKey: string;
  /** Overrides the wire's cheap/fast default model. */
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxTurns?: number;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

function clampReply(reply: string): string {
  return reply.length <= MAX_SMS_CHARS ? reply : reply.slice(0, MAX_SMS_CHARS);
}

function handoffOutput(reason: string, reply?: string): ReasonOutput {
  return {
    reply: clampReply(reply ?? NOOP_HANDOFF_MESSAGE),
    extractedFacts: {},
    suggestedState: "handed_off",
    confidence: 0,
    handoffReason: reason,
  };
}

/** Compact, model-safe rendering of the shop profile (facts only). */
function renderProfile(profile: ShopProfile): string {
  const services = profile.services
    .map((s) => {
      const price =
        s.priceMin != null
          ? `$${s.priceMin}${s.priceMax != null && s.priceMax !== s.priceMin ? `–$${s.priceMax}` : ""}`
          : "price on request";
      const mins = s.estimatedMinutes != null ? ` (~${s.estimatedMinutes} min)` : "";
      return `- ${s.name}: ${price}${mins}${s.description ? ` — ${s.description}` : ""}`;
    })
    .join("\n");
  const openDays = Object.entries(profile.hours.days ?? {})
    .filter(([, v]) => v != null)
    .map(([d, v]) => `${d} ${v!.open}–${v!.close}`)
    .join(", ");
  const towns = [...(profile.serviceArea.towns ?? []), ...(profile.serviceArea.zips ?? [])].join(", ");
  return [
    `Business: ${profile.businessName}`,
    services ? `Services:\n${services}` : "Services: (none listed — offer a callback for anything service-related)",
    `Hours (${profile.hours.timezone}): ${openDays || "not listed"}`,
    `Service area: ${towns || "not listed"}`,
    profile.escalation?.callbackPromise
      ? `Callback promise: ${profile.escalation.callbackPromise}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderIntent(input: ReasonInput): string {
  const intent = input.intent;
  const state =
    typeof intent.sourceEvent?.conversationState === "string"
      ? intent.sourceEvent.conversationState
      : "greeted";
  return [
    `Goal: ${intent.goal}`,
    `Current conversation state: ${state}`,
    intent.constraints.length
      ? `Constraints:\n${intent.constraints.map((c) => `- ${c}`).join("\n")}`
      : "",
    intent.acceptanceCriteria.length
      ? `Acceptance criteria:\n${intent.acceptanceCriteria.map((a) => `- ${a.description}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderMemoryProjection(input: ReasonInput): string {
  const facts = { ...input.facts, extra: undefined };
  return [
    `Known facts (JSON): ${JSON.stringify(facts)}`,
    `Conversation so far (compacted summary): ${input.summary || "(no history yet)"}`,
  ].join("\n");
}

const OUTPUT_CONTRACT = `Respond with JSON ONLY — no prose, no markdown fences. Shape:
{
  "reply": "the SMS text to send, ≤320 chars, in the shop voice from the instruction set",
  "suggestedState": "exactly one of: greeted, need_identified, vehicle_known, slot_offered, booked, callback_requested, handed_off, closed",
  "confidence": 0.0,
  "handoffReason": "required when suggestedState is handed_off or callback_requested; omit otherwise",
  "extractedFacts": { "vehicleYear": "2019", "vehicleMake": "Toyota" }
}
Rules for the JSON:
- suggestedState must be a legal next state from the current state (only advance the conversation; never skip ahead to booked without a slot).
- extractedFacts may ONLY use these keys: need, serviceId, serviceName, vehicleYear, vehicleMake, vehicleModel, vehicleMileage, customerName, customerId, callbackReason, handoffReason. Anything else is dropped.
- If you cannot answer from the shop profile, set suggestedState to handed_off with a handoffReason — never guess.
- If the customer asked for a human, is angry, or is outside the service area/capabilities, hand off.`;

/**
 * Assemble the model prompt from the allowed projection only.
 * Exported for tests: asserts the registry instruction set and memory
 * projection are present, and raw transcripts / phone numbers are not.
 */
export function buildSystemPrompt(input: ReasonInput): string {
  return [
    input.instructionSet,
    "",
    "## Output contract",
    OUTPUT_CONTRACT,
  ].join("\n");
}

export function buildUserPrompt(input: ReasonInput): string {
  return [
    "## Intent contract (owned by the runtime — follow it, do not reinterpret it)",
    renderIntent(input),
    "",
    "## Shop profile (the ONLY source of business facts)",
    renderProfile(input.profile),
    "",
    "## What you know about this customer (compacted — this is everything you get)",
    renderMemoryProjection(input),
  ].join("\n");
}

interface ParsedModelOutput {
  reply?: unknown;
  suggestedState?: unknown;
  confidence?: unknown;
  handoffReason?: unknown;
  extractedFacts?: unknown;
}

function sanitizeFacts(raw: unknown): Partial<ConversationFacts> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FACT_KEYS.has(k as keyof ConversationFacts) && typeof v === "string" && v.trim()) {
      out[k] = v.trim().slice(0, 200);
    }
  }
  return out as Partial<ConversationFacts>;
}

/**
 * Validate the model's raw output against the task graph. Returns a clean
 * ReasonOutput, or null when the output is off-spec (caller hands off).
 */
export function validateModelOutput(
  raw: string,
  currentState: ConversationState,
): ReasonOutput | null {
  let parsed: ParsedModelOutput;
  try {
    parsed = JSON.parse(raw) as ParsedModelOutput;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const suggestedState = parsed.suggestedState;
  if (typeof suggestedState !== "string" || !VALID_STATES.includes(suggestedState as ConversationState)) {
    return null;
  }
  try {
    transition(currentState, suggestedState as ConversationState);
  } catch {
    return null; // illegal transition — the model never owns the workflow
  }

  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

  const needsHandoffReason =
    suggestedState === "handed_off" || suggestedState === "callback_requested";
  const handoffReason =
    typeof parsed.handoffReason === "string" && parsed.handoffReason.trim()
      ? parsed.handoffReason.trim().slice(0, 300)
      : needsHandoffReason
        ? "model requested handoff without a reason"
        : undefined;

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply && !needsHandoffReason) return null; // expected output missing

  return {
    reply: clampReply(reply || NOOP_HANDOFF_MESSAGE),
    extractedFacts: sanitizeFacts(parsed.extractedFacts),
    suggestedState: suggestedState as ConversationState,
    confidence,
    handoffReason,
  };
}

export class ProviderReasoner implements ModelReasoner {
  readonly name: string;

  private readonly provider: ModelProviderName;
  private readonly apiKey: string;
  private readonly model?: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly maxTurns: number;
  private readonly fetchImpl?: typeof fetch;

  constructor(opts: ProviderReasonerOptions) {
    this.provider = opts.provider;
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? MODEL_TIMEOUT_MS;
    this.maxOutputTokens = opts.maxOutputTokens ?? MODEL_MAX_OUTPUT_TOKENS;
    this.maxTurns = opts.maxTurns ?? MODEL_MAX_TURNS;
    this.fetchImpl = opts.fetchImpl;
    this.name = `provider:${opts.provider}`;
  }

  async reason(input: ReasonInput): Promise<ReasonOutput> {
    // Guardrail: turn cap — long conversations go to a human.
    const turnCount = input.turnCount ?? 0;
    if (turnCount >= this.maxTurns) {
      return {
        ...handoffOutput(`turn cap reached (${turnCount} >= ${this.maxTurns})`),
        confidence: 0,
      };
    }

    const currentState =
      typeof input.intent.sourceEvent?.conversationState === "string" &&
      VALID_STATES.includes(input.intent.sourceEvent.conversationState as ConversationState)
        ? (input.intent.sourceEvent.conversationState as ConversationState)
        : "greeted";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const result = await chatCompletion(
        this.provider,
        this.apiKey,
        [
          { role: "system", content: buildSystemPrompt(input) },
          { role: "user", content: buildUserPrompt(input) },
        ],
        {
          model: this.model,
          maxTokens: this.maxOutputTokens,
          temperature: MODEL_TEMPERATURE,
          signal: controller.signal,
          fetchImpl: this.fetchImpl,
        },
      );
      const validated = validateModelOutput(result.content, currentState);
      const usage: ModelUsage = {
        model: result.model,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
        latencyMs: Date.now() - startedAt,
      };
      if (!validated) {
        return {
          ...handoffOutput("model output failed task-graph validation"),
          usage,
        };
      }
      return { ...validated, usage };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `model request timed out after ${this.timeoutMs}ms`
          : `model request failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`;
      return handoffOutput(reason);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Bootstrap: build the reasoner from env. No key (or an unknown provider)
 * fails closed to NoopReasoner — the safe posture never changes.
 *
 *   SHOP_AGENT_MODEL_PROVIDER  openai | anthropic | gemini | xai (default: openai)
 *   SHOP_AGENT_MODEL_API_KEY    provider API key (absent → NoopReasoner)
 *   SHOP_AGENT_MODEL_NAME       model override (default: the wire's cheap/fast tier)
 */
export function createReasonerFromEnv(
  env: Record<string, string | undefined> = process.env,
): ModelReasoner {
  const provider = (env[SHOP_AGENT_MODEL_PROVIDER_ENV]?.trim().toLowerCase() ||
    "openai") as ModelProviderName;
  if (!PROVIDER_WIRES[provider]) {
    console.error(
      `[shop-agent] unknown ${SHOP_AGENT_MODEL_PROVIDER_ENV}="${env[SHOP_AGENT_MODEL_PROVIDER_ENV]}" — failing closed to NoopReasoner`,
    );
    return new NoopReasoner();
  }
  const apiKey = env[SHOP_AGENT_MODEL_API_KEY_ENV]?.trim();
  if (!apiKey) {
    return new NoopReasoner();
  }
  const model = env[SHOP_AGENT_MODEL_NAME_ENV]?.trim() || undefined;
  return new ProviderReasoner({ provider, apiKey, model });
}
