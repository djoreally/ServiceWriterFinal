/**
 * ZeroAI task graph — deterministic conversation executor (Phase 1 SMS).
 *
 * The model NEVER decides transitions. The reasoner only proposes a
 * `suggestedState`; this module validates it against the node's
 * `transitionsTo` via `transition()`. Anything illegal throws.
 */
import type {
  ConversationState,
  RetryPolicy,
  TaskNode,
} from "./types";

const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 2, backoffMs: 1000 };

/** Per-turn execution budget: an SMS turn must resolve in seconds, not minutes. */
export const NODE_TIMEOUT_MS = 30000;

const COMMON_OUTPUTS = ["sms_reply", "extracted_facts", "suggested_state"];

function makeNode(
  id: string,
  states: ConversationState[],
  acceptanceGate: string,
  transitionsTo: ConversationState[],
  opts: {
    dependencies?: string[];
    inputs?: string[];
    expectedOutputs?: string[];
    permissions?: string[];
  } = {},
): TaskNode {
  return {
    id,
    states,
    dependencies: opts.dependencies ?? [],
    inputs: opts.inputs ?? [],
    expectedOutputs: opts.expectedOutputs ?? COMMON_OUTPUTS,
    timeoutMs: NODE_TIMEOUT_MS,
    retryPolicy: { ...DEFAULT_RETRY_POLICY },
    permissions: opts.permissions ?? [],
    acceptanceGate,
    transitionsTo,
  };
}

/**
 * The full Phase 1 conversation graph, from the spec's state machine:
 * greeted → need_identified → vehicle_known → slot_offered → booked
 * with callback_requested | handed_off | closed exits at the legal points.
 */
export const SMS_TASK_GRAPH: Record<ConversationState, TaskNode> = {
  greeted: makeNode("greeted", ["greeted"], "policy_check", [
    "need_identified",
    "handed_off",
    "closed",
  ], {
    inputs: ["customer_message", "shop_profile", "conversation_summary"],
    permissions: ["send_sms", "read_profile", "create_callback", "log_event"],
  }),

  need_identified: makeNode(
    "need_identified",
    ["need_identified"],
    "policy_check",
    ["vehicle_known", "handed_off", "callback_requested", "closed"],
    {
      dependencies: ["greeted"],
      inputs: ["customer_message", "shop_profile", "conversation_facts"],
      permissions: ["send_sms", "read_profile", "create_callback", "log_event"],
    },
  ),

  vehicle_known: makeNode(
    "vehicle_known",
    ["vehicle_known"],
    "policy_check",
    ["slot_offered", "handed_off", "callback_requested"],
    {
      dependencies: ["need_identified"],
      inputs: ["customer_message", "shop_profile", "conversation_facts"],
      permissions: [
        "send_sms",
        "read_profile",
        "read_availability",
        "create_callback",
        "log_event",
      ],
    },
  ),

  slot_offered: makeNode(
    "slot_offered",
    ["slot_offered"],
    "slot_exists",
    ["booked", "need_identified", "handed_off", "callback_requested"],
    {
      dependencies: ["vehicle_known"],
      inputs: [
        "customer_message",
        "available_slots",
        "shop_profile",
        "conversation_facts",
      ],
      permissions: [
        "send_sms",
        "read_profile",
        "read_availability",
        "create_callback",
        "log_event",
      ],
    },
  ),

  booked: makeNode("booked", ["booked"], "appointment_verified", ["closed"], {
    dependencies: ["slot_offered"],
    inputs: ["chosen_slot", "shop_profile", "customer_record"],
    expectedOutputs: [
      ...COMMON_OUTPUTS,
      "appointment_id",
      "confirmation_message",
    ],
    permissions: ["send_sms", "read_profile", "create_appointment", "log_event"],
  }),

  callback_requested: makeNode(
    "callback_requested",
    ["callback_requested"],
    "policy_check",
    ["closed"],
    {
      inputs: ["callback_reason", "customer_message"],
      expectedOutputs: [...COMMON_OUTPUTS, "callback_task_id"],
      permissions: ["send_sms", "create_callback", "log_event"],
    },
  ),

  handed_off: makeNode("handed_off", ["handed_off"], "policy_check", ["closed"], {
    inputs: ["handoff_reason", "conversation_summary"],
    expectedOutputs: [...COMMON_OUTPUTS, "callback_task_id"],
    permissions: ["send_sms", "create_callback", "log_event"],
  }),

  closed: makeNode("closed", ["closed"], "policy_check", ["closed"], {
    inputs: ["conversation_summary"],
    expectedOutputs: ["log_event_entry"],
    permissions: ["log_event"],
  }),
};

/** All conversation states covered by the graph. */
export const CONVERSATION_STATES: ConversationState[] = Object.keys(
  SMS_TASK_GRAPH,
) as ConversationState[];

/** Fetch the node for a state; throws on unknown state. */
export function getNode(state: ConversationState): TaskNode {
  const node = SMS_TASK_GRAPH[state];
  if (!node) {
    throw new Error(`Unknown conversation state: ${String(state)}`);
  }
  return node;
}

/**
 * Validate a model-suggested transition. Returns the next state on success,
 * throws on any illegal transition. The model never decides — this does.
 */
export function transition(
  state: ConversationState,
  signal: ConversationState,
): ConversationState {
  const node = getNode(state);
  if (!node.transitionsTo.includes(signal)) {
    throw new Error(
      `Illegal transition: ${state} -> ${signal}. ` +
        `Legal transitions: ${node.transitionsTo.join(", ")}`,
    );
  }
  return signal;
}

/** True when the state has no onward transitions (conversation is over). */
export function isTerminal(state: ConversationState): boolean {
  const node = getNode(state);
  return (
    node.transitionsTo.length === 1 && node.transitionsTo[0] === state
  );
}
