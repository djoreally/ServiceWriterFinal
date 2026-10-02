/**
 * Shop Agent Phase 1 — inbound SMS pipeline.
 *
 * STOP/HELP compliance first, then the deterministic conversation loop:
 * loadMemory → buildInboundSmsIntent → reason → transition validation →
 * node acceptance gate → send → extractFacts/mergeFacts → compactSummary →
 * saveMemory → ledger.
 *
 * The model only proposes (ModelReasoner.reason); every state transition,
 * gate evaluation, and persistence step is deterministic. Booking goes
 * through the real bookingPort from ../booking (the shop's single booking
 * path). The port is injectable for tests; passing `bookingPort: null`
 * disables booking and any booked-intent becomes a "booking unavailable"
 * handoff — slots and appointments are never invented.
 *
 * Spec: ~/workspace/shop-agent/phase-1-sms-spec.md sections 3, 4, 6, 9.
 */
import { buildInboundSmsIntent } from "../zeroai/intent";
import { checkPolicy, isHelpMessage, isStopMessage } from "../zeroai/policy";
import { checkGate } from "../zeroai/gates";
import {
  blankFacts,
  compactSummary,
  extractFacts,
  loadMemory,
  mergeFacts,
  saveMemory,
} from "../zeroai/memory";
import type { SupabaseMemoryClient } from "../zeroai/memory";
import { getNode, transition } from "../zeroai/taskgraph";
import { AGENT_REGISTRY } from "../zeroai/registry";
import { createReasonerFromEnv } from "../zeroai/provider-reasoner";
import { bookingPort as defaultBookingPort } from "../booking";
import type { AgentBookingInput, BookingPort } from "../booking";
import {
  currentLocalMinutes,
  getShopProfile,
  isWithinBusinessHours,
} from "../profile";
import { hashPhoneE164, sha256Hex } from "../zeroai/types";
import type {
  ConversationFacts,
  ConversationMemory,
  ConversationState,
  GateResult,
  IntentContract,
  ModelReasoner,
} from "../zeroai/types";
import type { ShopAgentSupabase } from "./db";
import { logLedgerEvent, newLedgerEvent } from "./ledger-events";
import { sendShopSms } from "./sending";
import type { ShopSmsSender } from "./sending";
import { isSuppressed } from "./suppressions";
import {
  HANDOFF_CALLBACK_TEMPLATE,
  HELP_TEMPLATE,
  START_CONFIRM_TEMPLATE,
  STOP_CONFIRM_TEMPLATE,
  renderTemplate,
} from "./templates";

// ---------------------------------------------------------------------------
// Dependencies & seams
// ---------------------------------------------------------------------------

export interface SmsPipelineDeps {
  supabase: ShopAgentSupabase;
  smsAdapter: ShopSmsSender;
  reasoner: ModelReasoner;
}

export interface InboundSmsMessage {
  workspaceId: string;
  from: string;
  body: string;
  providerMessageId?: string;
}

export type InboundSmsOutcome =
  | "replied"
  | "callback_created"
  | "send_blocked"
  | "dropped_suppressed"
  | "dropped_empty"
  | "stop"
  | "start"
  | "help"
  | "duplicate";

export interface InboundSmsResult {
  outcome: InboundSmsOutcome;
  state?: ConversationState;
  providerMessageId?: string;
}

export interface ProcessInboundSmsOptions {
  /**
   * Booking seam. `undefined` (default) uses the real bookingPort from
   * ../booking (the shop's single booking path). Pass `null` to disable
   * booking — booked-intents then hand off as "booking unavailable".
   */
  bookingPort?: BookingPort | null;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Reasoner wiring
// ---------------------------------------------------------------------------

let defaultReasoner: ModelReasoner | null = null;
let reasonerInitialized = false;

/**
 * The model-calling reasoner is injected here (tests, explicit wiring) or
 * built lazily from env by ensureDefaultReasoner() — with no
 * SHOP_AGENT_MODEL_API_KEY that is the NoopReasoner, so the pipeline always
 * has a safe reasoner and never runs model-free by accident.
 */
export function setShopAgentReasoner(reasoner: ModelReasoner | null): void {
  defaultReasoner = reasoner;
  reasonerInitialized = true;
}

export function getDefaultReasoner(): ModelReasoner | null {
  return defaultReasoner;
}

/**
 * Lazily builds the reasoner from env on first use (serverless-safe).
 * No SHOP_AGENT_MODEL_API_KEY → NoopReasoner: fail closed, exactly as
 * before. setShopAgentReasoner() still overrides (tests, explicit wiring).
 */
export function ensureDefaultReasoner(): ModelReasoner {
  if (!reasonerInitialized) {
    defaultReasoner = createReasonerFromEnv();
    reasonerInitialized = true;
  }
  return defaultReasoner as ModelReasoner;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOW_CONFIDENCE_THRESHOLD = 0.4;

function emptyFacts(): ConversationFacts {
  return blankFacts();
}

/** START is not in the policy worker's keyword contract; handle rejoin locally. */
function isStartMessage(body: string): boolean {
  return /^\s*start\s*$/i.test(body);
}

/** Illegal transitions become handed_off — the model never owns the workflow. */
function safeTransition(from: ConversationState, to: ConversationState): ConversationState {
  try {
    return transition(from, to) ?? "handed_off";
  } catch {
    return "handed_off";
  }
}

function memoryClient(supabase: ShopAgentSupabase): SupabaseMemoryClient {
  return supabase as unknown as SupabaseMemoryClient;
}

async function ledgerHasInputHash(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  action: string,
  inputHash: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shop_agent_ledger")
    .select("event_id")
    .eq("workspace_id", workspaceId)
    .eq("action", action)
    .eq("input_hash", inputHash)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Human callback task in the existing crm_tasks model (per spec section 4:
 * callback_requested / handed_off create the human callback task with the
 * full summary). Customer link is best-effort by phone lookup.
 */
async function createCallbackTask(
  supabase: ShopAgentSupabase,
  input: {
    workspaceId: string;
    phone: string;
    reason: string;
    summary: string;
    facts: ConversationFacts;
  },
): Promise<string | null> {
  let customerId: string | null = null;
  try {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("phone", input.phone)
      .maybeSingle();
    customerId = (data?.id as string | undefined) ?? null;
  } catch {
    // Best-effort only.
  }
  try {
    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({
        workspace_id: input.workspaceId,
        customer_id: customerId,
        title: `Shop Agent callback: ${input.phone}`,
        description:
          `Reason: ${input.reason}\n\n` +
          `Summary: ${input.summary}\n\n` +
          `Facts: ${JSON.stringify(input.facts)}`,
        status: "open",
        due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  } catch (error) {
    console.error("shop_agent_callback_task_failed", {
      workspaceId: input.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function processInboundSms(
  deps: SmsPipelineDeps,
  msg: InboundSmsMessage,
  opts: ProcessInboundSmsOptions = {},
): Promise<InboundSmsResult> {
  const now = opts.now ?? new Date();
  const { supabase, smsAdapter, reasoner } = deps;
  const { workspaceId, from } = msg;
  const body = (msg.body ?? "").trim();
  const providerMessageId = msg.providerMessageId;
  const callerHash = hashPhoneE164(from);
  const port = opts.bookingPort === undefined ? defaultBookingPort : opts.bookingPort;

  const log = (event: Omit<Parameters<typeof newLedgerEvent>[0], "workspaceId" | "actor">) =>
    logLedgerEvent(supabase, newLedgerEvent({ workspaceId, actor: callerHash, ...event }));

  if (!body) {
    await log({
      action: "message_dropped_empty",
      inputHash: sha256Hex(`sms_empty:${workspaceId}:${from}`),
      evidenceRefs: providerMessageId ? [providerMessageId] : [],
    });
    return { outcome: "dropped_empty" };
  }

  // Idempotency: exactly one pipeline run per provider message.
  const receivedHash = sha256Hex(
    `sms_received:${workspaceId}:${providerMessageId ?? `${from}:${body}`}`,
  );
  if (await ledgerHasInputHash(supabase, workspaceId, "sms_received", receivedHash)) {
    return { outcome: "duplicate" };
  }
  await log({
    action: "sms_received",
    inputHash: receivedHash,
    evidenceRefs: providerMessageId ? [providerMessageId] : [],
  });

  const profile = await getShopProfile(supabase, workspaceId);
  const businessName = profile.businessName;
  const smsKey = providerMessageId ?? receivedHash.slice(0, 32);
  const timeZone = profile.hours.timezone || "UTC";

  async function sendComplianceReply(
    templateKey: string,
    reply: string,
    action: string,
  ): Promise<string> {
    const sent = await sendShopSms(supabase, smsAdapter, {
      workspaceId,
      to: from,
      body: reply,
      idempotencyKey: `sms:${smsKey}`,
      templateKey,
      metadata: { source: "shop-agent-compliance" },
    });
    await log({
      action,
      inputHash: receivedHash,
      outputHash: sha256Hex(reply),
      evidenceRefs: [providerMessageId ?? "", sent.providerMessageId],
    });
    return sent.providerMessageId;
  }

  // --- STOP: opt out via the existing messaging_suppressions table ---
  if (isStopMessage(body)) {
    const { data: existing } = await supabase
      .from("messaging_suppressions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel", "sms")
      .eq("phone", from)
      .eq("active", true)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("messaging_suppressions").insert({
        workspace_id: workspaceId,
        channel: "sms",
        phone: from,
        reason: "unsubscribe",
        purpose: "transactional",
        source: "shop-agent-sms",
        active: true,
        suppressed_at: now.toISOString(),
      });
      if (error) throw error;
    }
    const providerId = await sendComplianceReply(
      "shop_agent.stop_confirm",
      renderTemplate(STOP_CONFIRM_TEMPLATE, { businessName }),
      "stop_received",
    );
    return { outcome: "stop", providerMessageId: providerId };
  }

  // --- START: lift the opt-out (the STOP confirmation promises rejoin) ---
  if (isStartMessage(body)) {
    const { error } = await supabase
      .from("messaging_suppressions")
      .update({ active: false, lifted_at: now.toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("channel", "sms")
      .eq("phone", from)
      .eq("active", true);
    if (error) throw error;
    const providerId = await sendComplianceReply(
      "shop_agent.start_confirm",
      renderTemplate(START_CONFIRM_TEMPLATE, { businessName }),
      "start_received",
    );
    return { outcome: "start", providerMessageId: providerId };
  }

  // --- HELP: answered even for opted-out numbers (solicited, not marketing) ---
  if (isHelpMessage(body)) {
    const providerId = await sendComplianceReply(
      "shop_agent.help",
      renderTemplate(HELP_TEMPLATE, {
        businessName,
        phone: profile.publicPhone ?? "",
      }),
      "help_sent",
    );
    return { outcome: "help", providerMessageId: providerId };
  }

  // --- Suppressed senders (non-STOP/HELP): drop silently ---
  if (await isSuppressed(supabase, workspaceId, from)) {
    await log({
      action: "message_dropped_suppressed",
      inputHash: receivedHash,
      evidenceRefs: providerMessageId ? [providerMessageId] : [],
    });
    return { outcome: "dropped_suppressed" };
  }

  // --- Conversation loop ---
  const mem = await loadMemory(memoryClient(supabase), workspaceId, callerHash);
  const currentState: ConversationState = mem?.state ?? "greeted";
  const intent = buildInboundSmsIntent(workspaceId, from, body, currentState);
  const out = await reasoner.reason({
    intent,
    facts: mem?.facts ?? emptyFacts(),
    summary: mem?.summary ?? "",
    profile,
    instructionSet: AGENT_REGISTRY.sms_agent?.instructionSet ?? "",
    turnCount: mem?.turnCount ?? 0,
  });

  // ZeroCert cost evidence: token usage goes to the ledger, never to decisions.
  if (out.usage) {
    await log({
      action: "model_usage",
      inputHash: receivedHash,
      evidenceRefs: [
        intent.intentId,
        out.usage.model,
        `prompt_tokens:${out.usage.promptTokens ?? "?"}`,
        `completion_tokens:${out.usage.completionTokens ?? "?"}`,
        `latency_ms:${out.usage.latencyMs ?? "?"}`,
      ],
    });
  }

  let nextState = safeTransition(currentState, out.suggestedState);
  if (nextState === "handed_off" && out.suggestedState !== "handed_off") {
    await log({
      action: "transition_corrected",
      inputHash: receivedHash,
      evidenceRefs: [intent.intentId, currentState, out.suggestedState],
    });
  }

  // Deterministic facts: regex extraction from the message, then merge the
  // model-extracted partial facts (only empty slots are filled).
  let facts = mergeFacts(extractFacts(mem?.facts ?? emptyFacts(), body), out.extractedFacts ?? {});
  let reply = out.reply;

  const handoffTemplate = () =>
    renderTemplate(HANDOFF_CALLBACK_TEMPLATE, {
      callbackPromise: profile.escalation?.callbackPromise ?? "shortly",
      Phone: profile.publicPhone ?? "",
    });

  let handoffReason: string | undefined;
  if (out.confidence < LOW_CONFIDENCE_THRESHOLD) {
    nextState = "handed_off";
    handoffReason = `low model confidence (${out.confidence})`;
  } else if (nextState === "booked" && !port) {
    nextState = "handed_off";
    handoffReason = "booking unavailable — booking module not wired";
    await log({
      action: "booking_unavailable",
      inputHash: receivedHash,
      evidenceRefs: [intent.intentId],
    });
  } else if (nextState === "handed_off") {
    handoffReason = out.handoffReason ?? "handoff";
  } else if (nextState === "callback_requested") {
    handoffReason = out.handoffReason ?? "callback requested";
  }

  async function doHandoff(reason: string): Promise<void> {
    const summary = compactSummary(mem?.summary ?? "", `Customer: ${body}\nAgent: ${reply}`);
    const taskId = await createCallbackTask(supabase, {
      workspaceId,
      phone: from,
      reason,
      summary,
      facts,
    });
    await log({
      action: "callback_created",
      inputHash: receivedHash,
      outputHash: sha256Hex(summary),
      evidenceRefs: [intent.intentId, taskId ?? "task_write_failed"],
    });
  }

  if (handoffReason !== undefined) {
    if (out.confidence < LOW_CONFIDENCE_THRESHOLD || !reply) {
      reply = handoffTemplate();
    }
    await doHandoff(handoffReason);
  } else {
    // slot_offered: real openings only, from the booking system.
    if (nextState === "slot_offered") {
      if (!facts.serviceId) {
        nextState = "handed_off";
        handoffReason = "no service identified — cannot offer real slots";
        reply = handoffTemplate();
        await doHandoff(handoffReason);
      } else {
        try {
          const slots = await port.getSlots(supabase, workspaceId, facts.serviceId);
          facts = {
            ...facts,
            offeredSlots: slots.map((s) => ({
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              label: s.label,
            })),
          };
          if (slots.length > 0) {
            reply =
              `${reply}\n\nOpenings I can offer right now: ` +
              `${slots.map((s) => s.label).join(" or ")}. ` +
              `Reply with the one you want and I'll book it.`;
          }
        } catch (error) {
          console.error("shop_agent_slots_failed", {
            workspaceId,
            error: error instanceof Error ? error.message : String(error),
          });
          nextState = "handed_off";
          handoffReason = "slot lookup failed";
          reply = handoffTemplate();
          await doHandoff(handoffReason);
        }
      }
    }

    // booked: authorize, match/create the customer, book, verify.
    if (nextState === "booked" && handoffReason === undefined && port) {
      const slot = facts.chosenSlot ?? facts.offeredSlots?.[0];
      if (!slot) {
        nextState = "handed_off";
        handoffReason = "no slot selected for booking";
        reply = handoffTemplate();
        await doHandoff(handoffReason);
      } else {
        // Authority note (booking.ts): create_appointment requires a ZeroPolicy
        // `act`. Business hours are enforced deterministically; the customer's
        // location is not collected over SMS in Phase 1, so service-area
        // gating stays with the reasoner's out-of-area handoff trigger
        // (spec section 4) until location capture exists.
        const bookingDecision = checkPolicy("create_appointment", {
          workspaceId,
          withinBusinessHours: isWithinBusinessHours(profile, now),
          withinServiceArea: true,
        });
        if (bookingDecision.decision !== "act") {
          nextState = "handed_off";
          handoffReason = `booking blocked by policy (${bookingDecision.ruleId})`;
          reply = handoffTemplate();
          await doHandoff(handoffReason);
        } else {
          try {
            const customer = await port.findOrCreateCustomer(
              supabase,
              workspaceId,
              from,
              facts.customerName,
            );
            const bookingInput: AgentBookingInput = {
              customerId: customer.id,
              serviceCatalogId: facts.serviceId ?? null,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              notes: `Shop Agent SMS booking (${intent.intentId})`,
              estimatedCost: null,
            };
            const booked = await port.book(supabase, workspaceId, bookingInput);
            if ("error" in booked) {
              throw new Error("booking core returned an error response");
            }
            const appointmentId = (booked.data as { id?: string } | null)?.id;
            if (!appointmentId) {
              throw new Error("booking core returned no appointment id");
            }
            // appointment_verified gate: prove the booking exists before
            // confirming it to the customer.
            const verified = await checkGate("appointment_verified", {
              appointmentId,
              appointmentLookup: async (id: string) => {
                const { data } = await supabase
                  .from("appointments")
                  .select("id")
                  .eq("workspace_id", workspaceId)
                  .eq("id", id)
                  .maybeSingle();
                return !!data;
              },
            });
            if (!verified.passed) {
              throw new Error(`appointment verification failed: ${verified.reason}`);
            }
            facts = { ...facts, appointmentId };
            const slotLabel =
              facts.offeredSlots?.find((s) => s.startsAt === slot.startsAt)?.label ?? "";
            if (!reply) {
              reply = `You're booked${slotLabel ? ` for ${slotLabel}` : ""}!`;
            }
            await log({
              action: "appointment_booked",
              inputHash: receivedHash,
              evidenceRefs: [intent.intentId, appointmentId],
            });
          } catch (error) {
            console.error("shop_agent_booking_failed", {
              workspaceId,
              error: error instanceof Error ? error.message : String(error),
            });
            nextState = "handed_off";
            handoffReason = "booking failed";
            reply = handoffTemplate();
            await doHandoff(handoffReason);
          }
        }
      }
    }
  }

  // Final authorization: the task-graph node's acceptance gate.
  // slot_offered carries slot_exists (never offer invented slots);
  // everything else goes through the policy_check send_message gate.
  const node = getNode(nextState);
  let gate: GateResult;
  if (node.acceptanceGate === "slot_exists") {
    gate = await checkGate("slot_exists", { slots: facts.offeredSlots ?? [] });
  } else {
    gate = await checkGate("policy_check", {
      policyAction: "send_message",
      policyCtx: {
        workspaceId,
        localTimeMinutes: currentLocalMinutes(timeZone, now),
        optedOut: false,
      },
    });
  }
  if (!gate.passed) {
    if (node.acceptanceGate === "slot_exists") {
      // No real availability — hand the conversation to a human instead of
      // sending a slot-less offer, then authorize the handoff text.
      nextState = "handed_off";
      handoffReason = "no availability right now";
      reply = handoffTemplate();
      await doHandoff(handoffReason);
      const handoffGate = await checkGate("policy_check", {
        policyAction: "send_message",
        policyCtx: {
          workspaceId,
          localTimeMinutes: currentLocalMinutes(timeZone, now),
          optedOut: false,
        },
      });
      if (!handoffGate.passed) {
        return await blockSend("slot_exists", handoffGate);
      }
    } else {
      return await blockSend("policy_check", gate);
    }
  }

  async function blockSend(
    gateName: string,
    failedGate: GateResult,
  ): Promise<InboundSmsResult> {
    await log({
      action: "send_blocked",
      inputHash: receivedHash,
      evidenceRefs: [intent.intentId, gateName, failedGate.reason],
    });
    const blockedMemory: ConversationMemory = {
      workspaceId,
      callerHash,
      state: "handed_off",
      facts,
      summary: compactSummary(mem?.summary ?? "", `Customer: ${body}\nAgent: (send blocked)`),
      turnCount: (mem?.turnCount ?? 0) + 1,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
    await saveMemory(memoryClient(supabase), blockedMemory);
    return { outcome: "send_blocked", state: "handed_off" };
  }

  const sent = await sendShopSms(supabase, smsAdapter, {
    workspaceId,
    to: from,
    body: reply,
    idempotencyKey: `sms:${smsKey}`,
    templateKey: "shop_agent.sms_reply",
    metadata: { intent_id: intent.intentId, state: nextState },
  });

  const summary = compactSummary(mem?.summary ?? "", `Customer: ${body}\nAgent: ${reply}`);
  const nextMemory: ConversationMemory = {
    workspaceId,
    callerHash,
    state: nextState,
    facts,
    summary,
    turnCount: (mem?.turnCount ?? 0) + 1,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
  await saveMemory(memoryClient(supabase), nextMemory);

  await log({
    action: "sms_replied",
    inputHash: receivedHash,
    outputHash: sha256Hex(reply),
    evidenceRefs: [intent.intentId, providerMessageId ?? "", getNode(nextState).id, sent.providerMessageId],
  });

  return {
    outcome: handoffReason !== undefined ? "callback_created" : "replied",
    state: nextState,
    providerMessageId: sent.providerMessageId,
  };
}
