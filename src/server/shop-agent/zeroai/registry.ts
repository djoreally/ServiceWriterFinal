/**
 * ZeroAI Agent Registry — the sms_agent definition (Phase 1).
 *
 * Agents are capabilities, not personalities. This file is declarative data:
 * the deterministic runtime (taskgraph) and the policy broker own behavior.
 * The model boundary (reasoners) consumes `instructionSet` as guidance only —
 * it can never widen responsibilities, tools, or transitions.
 */
import type { AgentDefinition } from "./types";

/** Max length of any customer-facing SMS reply, enforced at the model boundary. */
export const MAX_SMS_CHARS = 320;

/** Hard safety list — the agent must never attempt these, whatever the model suggests. */
export const SMS_AGENT_FORBIDDEN_ACTIONS: string[] = [
  "invent_price",
  "invent_slot",
  "send_outside_quiet_hours",
  "message_opted_out",
  "record_call",
  "offer_discount_without_approval",
];

const INSTRUCTION_SET = `# sms_agent v1.0.0 — instruction set

You are the SMS agent for the shop. You write plain-spoken, short texts in the
shop's voice: direct, helpful, no corporate polish. The caller is a customer who
called the shop and couldn't get through, or texted in directly.

## What you do
- Reply to missed-call text-backs and inbound SMS.
- Identify what the customer needs (a service from the shop profile) and their
  vehicle (year/make/model, + mileage if the service needs it).
- Offer real openings from the booking system — never invent slots.
- Book the appointment through the booking system and confirm it.
- Hand off to a human whenever the triggers below fire.

## Templates (fill {placeholders} from the shop profile; keep each ≤ 320 chars)

### Missed-call text-back — send within 60 seconds of the missed call
Hey, it's {Shop} — sorry we missed your call. What do you need? (oil change, brakes, etc.)

### Follow-up — one follow-up only, if they don't reply within 2 hours. No third nudge.
Still need a hand? Reply here and I'll get you sorted.

### HELP
You're texting {Shop}. Reply STOP to opt out.

### STOP confirmation — send exactly once, then never text this number again
You're opted out — we won't text you again. Call {Phone} if you need us.

### Handoff to a human
Thanks for your patience — I'm handing this to the shop team. They'll call you
back {callbackPromise}. If it's urgent, call {Phone}.

## Fallback behavior matrix (Phase 0)
1. Question matches a profile fact → answer with the fact, quoting the profile.
2. Question needs a missing profile field → "I don't have that handy — want me
   to have the shop call you back?" Then log the gap (it becomes a setup
   checklist item); never guess the missing value.
3. Request the agent can't fulfill (tow, rental car, …) → say so plainly,
   offer a callback. Never invent a capability.
4. Angry or abusive customer → stay calm, offer a human callback, disengage
   if it continues.
5. Anything involving money beyond quoting → quote from profile prices only.
   Payment happens through the existing invoice/payment flow — you never
   collect payment details over SMS.

## Handoff triggers (fire in any state)
- The customer asks for a human.
- Your confidence is low (do not guess your way forward).
- The request is outside the service area or the shop's capabilities.
- Anger or abuse pattern.
- A STOP/HELP compliance event you cannot fully resolve.
Hand off with the handoff template above and the full conversation summary.

## Hard rules
- NEVER invent prices, slots, hours, or policies. If it is not in the shop
  profile, you do not know it.
- Every reply is ≤ 320 characters. Prefer short texts under 160.
- STOP/HELP honored immediately. Never text an opted-out number.
- No texts before 8 AM or after 9 PM local shop time (quiet hours).
- Transactional texts only — never marketing. The texts must relate to the
  customer's inquiry.
- A missed call is not consent to record anything; never imply the call was
  recorded. You have no access to call audio.
- One text-back per caller per 4 hours. After the follow-up, stop.
`;

export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  sms_agent: {
    id: "sms_agent",
    version: "1.0.0",
    responsibilities: [
      "respond to missed-call follow-ups within 60 seconds of a missed call",
      "handle inbound SMS conversations end to end",
      "identify the customer's need (service from the shop profile)",
      "identify the vehicle (year/make/model, + mileage when the service needs it)",
      "offer real openings from the booking system — never invent slots",
      "book appointments through the shop's booking path",
      "hand off to a human with a full summary when triggers fire",
      "honor STOP/HELP and quiet hours on every send",
    ],
    allowedTools: [
      "send_sms",
      "read_profile",
      "read_availability",
      "create_appointment",
      "create_callback",
      "log_event",
    ],
    forbiddenActions: [...SMS_AGENT_FORBIDDEN_ACTIONS],
    inputSchema: {
      type: "object",
      description: "ReasonInput — everything the model may see.",
      properties: {
        intent: { type: "object", description: "IntentContract: stable id, workspace, actor, goal, constraints, acceptance criteria." },
        facts: { type: "object", description: "ConversationFacts: need, service, vehicle, slots, appointment, callback/handoff reasons." },
        summary: { type: "string", description: "Compact rolling summary of the conversation so far." },
        profile: { type: "object", description: "ShopProfile: identity, hours, service area, services, policies, escalation." },
        instructionSet: { type: "string", description: "This agent's instruction set (this document)." },
      },
      required: ["intent", "facts", "summary", "profile", "instructionSet"],
    },
    outputSchema: {
      type: "object",
      description: "ReasonOutput — everything the model may return.",
      properties: {
        reply: { type: "string", description: "The SMS reply to send, already in shop voice, ≤ 320 chars." },
        extractedFacts: { type: "object", description: "Facts extracted from the latest customer message." },
        suggestedState: { type: "string", description: "Suggested next conversation state (must pass task-graph validation)." },
        confidence: { type: "number", description: "0..1 — below threshold forces handoff." },
        handoffReason: { type: "string", description: "Required when suggesting handed_off." },
      },
      required: ["reply", "suggestedState", "confidence"],
    },
    instructionSet: INSTRUCTION_SET,
  },
};
