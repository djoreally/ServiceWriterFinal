/**
 * ZeroAI Intent constructors — deterministic, no model calls.
 *
 * The runtime owns the IntentContract. These functions only translate
 * channel events (missed call, inbound SMS) into zod-validated contracts
 * the rest of the pipeline can reason over.
 */
import { z } from "zod";
import { sha256Hex } from "./types";
import type {
  Channel,
  ConversationState,
  IntentContract,
  RiskLevel,
} from "./types";

// ---------------------------------------------------------------------------
// Schema — the contract shape, enforced at construction time.
// ---------------------------------------------------------------------------

export const IntentContractSchema = z.object({
  intentId: z.string().min(1),
  workspaceId: z.string().min(1),
  channel: z.enum(["sms", "phone", "mail"]),
  actor: z.string().min(1),
  goal: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
  permissions: z.array(z.string().min(1)).min(1),
  resources: z
    .array(
      z.object({
        kind: z.string().min(1),
        id: z.string().min(1),
      }),
    )
    .min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  sourceEvent: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
});

export function validateIntent(input: unknown): IntentContract {
  return IntentContractSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const QUIET_HOURS_CONSTRAINT =
  "send only between 08:00 and 21:00 workspace-local time (quiet hours); outside that window the send is blocked or queued";
const NO_INVENTED_PRICES_CONSTRAINT =
  "never invent prices, slots, or capabilities — quote only from the canonical shop profile";
const STOP_HONORED_CONSTRAINT =
  "a STOP (or equivalent opt-out keyword) immediately ends outbound messaging for that recipient";

function baseContract(args: {
  intentId: string;
  workspaceId: string;
  channel: Channel;
  actor: string;
  goal: string;
  constraints: string[];
  acceptanceCriteria: Array<{ id: string; description: string }>;
  permissions: string[];
  callerPhone: string;
  riskLevel: RiskLevel;
  sourceEvent: Record<string, unknown>;
}): IntentContract {
  return IntentContractSchema.parse({
    intentId: args.intentId,
    workspaceId: args.workspaceId,
    channel: args.channel,
    actor: args.actor,
    goal: args.goal,
    constraints: args.constraints,
    acceptanceCriteria: args.acceptanceCriteria,
    permissions: args.permissions,
    resources: [
      { kind: "workspace", id: args.workspaceId },
      { kind: "caller", id: args.callerPhone },
    ],
    riskLevel: args.riskLevel,
    sourceEvent: args.sourceEvent,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Missed-call text-back
// ---------------------------------------------------------------------------

export interface MissedCallInfo {
  callSid: string;
  callStatus: string;
  /** The shop number that was dialed (Twilio "To"). */
  to: string;
}

/**
 * Intent for the missed-call text-back wedge (Phase 1).
 * Low risk: a single outbound text, no record creation.
 */
export function buildMissedCallIntent(
  workspaceId: string,
  callerPhone: string,
  callInfo: MissedCallInfo,
): IntentContract {
  return baseContract({
    intentId: `missed-call-textback/${callInfo.callSid}`,
    workspaceId,
    channel: "sms",
    actor: callerPhone,
    callerPhone,
    goal: "send missed-call text-back",
    constraints: [
      QUIET_HOURS_CONSTRAINT,
      NO_INVENTED_PRICES_CONSTRAINT,
      STOP_HONORED_CONSTRAINT,
    ],
    acceptanceCriteria: [
      {
        id: "quiet-hours",
        description:
          "text-back is sent only when workspace-local time is 08:00–21:00; outside that window it is blocked or queued",
      },
      {
        id: "no-price-claims",
        description:
          "the text-back makes no price, slot, or service claims beyond what the shop profile states",
      },
      {
        id: "opt-out-respected",
        description:
          "the recipient is not on the messaging suppression list (STOP honored)",
      },
      {
        id: "single-send",
        description:
          "exactly one text-back is produced per missed call (dedupe on callSid)",
      },
    ],
    permissions: ["sms.send", "profile.read"],
    riskLevel: "low",
    sourceEvent: {
      kind: "missed_call",
      callSid: callInfo.callSid,
      callStatus: callInfo.callStatus,
      to: callInfo.to,
      callerPhone,
    },
  });
}

// ---------------------------------------------------------------------------
// Inbound SMS
// ---------------------------------------------------------------------------

/** States where the conversation is plausibly about to create an appointment. */
const BOOKING_PROGRESS_STATES: ConversationState[] = [
  "vehicle_known",
  "slot_offered",
];

/**
 * Intent for an inbound customer SMS.
 * Risk is "medium" once the conversation is far enough along that an
 * appointment could be created; otherwise "low".
 *
 * Note: the raw message body is NOT stored in the contract — only a hash
 * and length for evidence/dedupe. Message bodies live in the channel's
 * native log, never in the brain's persisted state.
 */
export function buildInboundSmsIntent(
  workspaceId: string,
  callerPhone: string,
  body: string,
  state: ConversationState,
): IntentContract {
  const riskLevel: RiskLevel = BOOKING_PROGRESS_STATES.includes(state)
    ? "medium"
    : "low";
  return baseContract({
    intentId: `inbound-sms/${sha256Hex(`${workspaceId}:${callerPhone}`).slice(0, 12)}/${sha256Hex(body).slice(0, 12)}`,
    workspaceId,
    channel: "sms",
    actor: callerPhone,
    callerPhone,
    goal: "respond to customer SMS and advance booking",
    constraints: [
      QUIET_HOURS_CONSTRAINT,
      NO_INVENTED_PRICES_CONSTRAINT,
      STOP_HONORED_CONSTRAINT,
      "answer only from canonical shop profile facts; missing fields trigger a callback offer, never a guess",
    ],
    acceptanceCriteria: [
      {
        id: "profile-grounded-reply",
        description:
          "every factual claim in the reply traces to a shop profile field",
      },
      {
        id: "booking-gates",
        description:
          "an appointment is created only inside business hours and inside the service area (policy broker decides)",
      },
      {
        id: "price-gates",
        description:
          "a quoted price comes from profile prices only; otherwise the agent offers a callback",
      },
      {
        id: "stop-handled",
        description:
          "STOP/QUIT/UNSUBSCRIBE keywords immediately opt the recipient out and stop outbound messaging",
      },
      {
        id: "low-confidence-handoff",
        description:
          "when confidence is below threshold the conversation hands off to a human instead of guessing",
      },
    ],
    permissions: ["sms.send", "profile.read", "appointment.create"],
    riskLevel,
    sourceEvent: {
      kind: "inbound_sms",
      bodyHash: sha256Hex(body),
      bodyLength: body.length,
      conversationState: state,
    },
  });
}
