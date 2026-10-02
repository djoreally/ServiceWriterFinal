/**
 * ZeroAI core types for the Shop Agent (Phase 1: missed-call text-back + SMS).
 *
 * Canonical architecture: ~/workspace/shop-agent/zeroai-framework.md
 * "Inference proposes. Deterministic systems decide. Evidence proves.
 *  Memory preserves. Policy authorizes."
 *
 * This file is the shared contract. Every worker builds against it.
 * Nothing here calls a model, a provider, or a database.
 */
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Hashing (ZeroLedger chain)
// ---------------------------------------------------------------------------

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashPhoneE164(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, "");
  return sha256Hex(`shop-agent-phone:${normalized}`);
}

// ---------------------------------------------------------------------------
// 1. Intent Contract — owned by the runtime, never by the model.
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high";

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface ResourceRef {
  kind: string;
  id: string;
}

export type Channel = "sms" | "phone" | "mail";

export interface IntentContract {
  /** Stable id for this intent (also the ledger event id seed). */
  intentId: string;
  workspaceId: string;
  channel: Channel;
  /** E.164 phone of the customer, or other actor identifier. */
  actor: string;
  goal: string;
  constraints: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  permissions: string[];
  resources: ResourceRef[];
  riskLevel: RiskLevel;
  /** Raw event that produced this intent (for evidence). */
  sourceEvent: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 2. Task Graph — deterministic workflow. The model never owns the workflow.
// ---------------------------------------------------------------------------

export type ConversationState =
  | "greeted"
  | "need_identified"
  | "vehicle_known"
  | "slot_offered"
  | "booked"
  | "callback_requested"
  | "handed_off"
  | "closed";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface TaskNode {
  id: string;
  /** State(s) this node may run from. */
  states: ConversationState[];
  dependencies: string[];
  inputs: string[];
  expectedOutputs: string[];
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  permissions: string[];
  /** Named gate that must pass before this node executes. */
  acceptanceGate: string;
  /** States this node may transition to. */
  transitionsTo: ConversationState[];
}

// ---------------------------------------------------------------------------
// 3. Agent Registry — agents are capabilities, not personalities.
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  version: string;
  responsibilities: string[];
  allowedTools: string[];
  forbiddenActions: string[];
  /** JSON-schema-ish descriptors (kept as records to avoid zod coupling here). */
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  instructionSet: string;
}

// ---------------------------------------------------------------------------
// 4. ZeroPolicy — deterministic permission broker.
// ---------------------------------------------------------------------------

export type PolicyAction =
  | "answer_faq"
  | "send_booking_confirmation"
  | "create_appointment"
  | "quote_price"
  | "promise_callback"
  | "offer_discount"
  | "send_message";

export type PolicyDecisionType = "act" | "draft" | "blocked";

export interface PolicyContext {
  workspaceId: string;
  /** Local time HH:MM in the workspace timezone, for quiet-hours checks. */
  localTimeMinutes?: number;
  /** True when the recipient previously texted STOP. */
  optedOut?: boolean;
  /** True when the action stays inside configured business hours. */
  withinBusinessHours?: boolean;
  /** True when the customer location is inside the service area. */
  withinServiceArea?: boolean;
  /** True when quoted from profile prices (not invented). */
  priceFromProfile?: boolean;
}

export interface PolicyDecision {
  decision: PolicyDecisionType;
  ruleId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// 5. ZeroLedger — hash-chained, tamper-evident event log.
// ---------------------------------------------------------------------------

export interface ZeroEvent {
  eventId: string;
  workspaceId: string;
  actor: string;
  action: string;
  timestamp: string;
  inputHash: string;
  outputHash?: string;
  parentHash: string;
  evidenceRefs: string[];
}

export interface LedgerRecord extends ZeroEvent {
  /** Hash of the canonical event payload — this is what chains. */
  eventHash: string;
}

// ---------------------------------------------------------------------------
// 6. ZeroMemory — compact per-caller state. Facts, not transcripts.
// ---------------------------------------------------------------------------

export interface ConversationFacts {
  need?: string;
  serviceId?: string;
  serviceName?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleMileage?: string;
  customerName?: string;
  customerId?: string;
  offeredSlots?: Array<{ startsAt: string; endsAt: string; label: string }>;
  chosenSlot?: { startsAt: string; endsAt: string };
  appointmentId?: string;
  callbackReason?: string;
  handoffReason?: string;
  /** Open string-keyed facts for forward compatibility. */
  extra: Record<string, string>;
}

export interface ConversationMemory {
  workspaceId: string;
  /** sha256 of the normalized caller phone — raw phone never stored here. */
  callerHash: string;
  state: ConversationState;
  facts: ConversationFacts;
  /** Compact rolling summary (a few sentences), not a transcript. */
  summary: string;
  turnCount: number;
  updatedAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// 7. ZeroGate — named gates on important transitions.
// ---------------------------------------------------------------------------

export type GateName =
  | "profile_complete"
  | "policy_check"
  | "slot_exists"
  | "appointment_verified";

export interface GateResult {
  gate: GateName;
  passed: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// 8. ZeroCert — evidence states, not claims.
// ---------------------------------------------------------------------------

export type EvidenceState = "VERIFIED" | "PARTIAL" | "UNKNOWN" | "FAILED";

// ---------------------------------------------------------------------------
// Shop profile (Phase 0, minimal for Phase 1)
// ---------------------------------------------------------------------------

export interface ServiceProfile {
  id: string;
  name: string;
  description?: string;
  priceMin?: number;
  priceMax?: number;
  estimatedMinutes?: number;
  category?: string;
}

export interface BusinessHours {
  timezone: string;
  /** weekday (lowercase, e.g. "monday") -> {open, close} in HH:MM, or null = closed */
  days: Record<string, { open: string; close: string } | null>;
}

export interface ShopProfile {
  workspaceId: string;
  businessName: string;
  publicPhone?: string;
  publicEmail?: string;
  bookingUrl?: string;
  /** Optional in Phase 1 — fallback behavior applies when absent. */
  brandVoice?: string;
  hours: BusinessHours;
  serviceArea: { towns: string[]; zips: string[]; radiusMiles?: number };
  services: ServiceProfile[];
  /** Optional in Phase 1. */
  policies?: Record<string, string>;
  /** Optional in Phase 1. */
  escalation?: { ownerPhone?: string; callbackPromise?: string };
  /** 0..100 — workspace may not go live below threshold. */
  completenessScore: number;
  /** Fields required for Phase 1 that are missing. */
  missingFields: string[];
}

// ---------------------------------------------------------------------------
// Model boundary — swappable. The architecture never depends on a provider.
// ---------------------------------------------------------------------------

export interface ReasonInput {
  intent: IntentContract;
  facts: ConversationFacts;
  summary: string;
  profile: ShopProfile;
  instructionSet: string;
  /**
   * Turns elapsed in this conversation (from ConversationMemory). The
   * provider reasoner enforces the turn cap from this; absence = 0.
   */
  turnCount?: number;
}

/** Token/cost evidence for the ZeroCert cost story (returned, never decided). */
export interface ModelUsage {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Wall-clock ms for the model call. */
  latencyMs?: number;
}

export interface ReasonOutput {
  /** The SMS reply to send (already in shop voice per instruction set). */
  reply: string;
  /** Facts extracted from the latest customer message. */
  extractedFacts: Partial<ConversationFacts>;
  suggestedState: ConversationState;
  /** 0..1 — below threshold forces handoff. */
  confidence: number;
  handoffReason?: string;
  /**
   * Token/cost evidence from a provider call. The pipeline writes this to
   * the ledger; the model never sees it and it never affects decisions.
   */
  usage?: ModelUsage;
}

/**
 * The ONLY interface the conversation layer has to any model.
 * Swap implementations without touching the architecture.
 */
export interface ModelReasoner {
  readonly name: string;
  reason(input: ReasonInput): Promise<ReasonOutput>;
}
