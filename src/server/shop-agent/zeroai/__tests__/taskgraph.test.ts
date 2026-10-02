/**
 * Tests for the deterministic SMS task graph.
 */
import {
  CONVERSATION_STATES,
  getNode,
  isTerminal,
  NODE_TIMEOUT_MS,
  SMS_TASK_GRAPH,
  transition,
} from "../taskgraph";
import type { ConversationState, TaskNode } from "../types";

const ALL_STATES: ConversationState[] = [
  "greeted",
  "need_identified",
  "vehicle_known",
  "slot_offered",
  "booked",
  "callback_requested",
  "handed_off",
  "closed",
];

describe("SMS_TASK_GRAPH", () => {
  test("has exactly one node per conversation state", () => {
    expect(CONVERSATION_STATES.sort()).toEqual(ALL_STATES.sort());
    for (const state of ALL_STATES) {
      const node = getNode(state);
      expect(node.id).toBe(state);
      expect(node.states).toContain(state);
      expect(node.timeoutMs).toBe(NODE_TIMEOUT_MS);
      expect(node.retryPolicy).toEqual({ maxAttempts: 2, backoffMs: 1000 });
      expect(typeof node.acceptanceGate).toBe("string");
      expect(node.transitionsTo.length).toBeGreaterThan(0);
    }
  });

  test("slot_offered gates on real slots, booked gates on verification", () => {
    expect(getNode("slot_offered").acceptanceGate).toBe("slot_exists");
    expect(getNode("booked").acceptanceGate).toBe("appointment_verified");
    expect(getNode("greeted").acceptanceGate).toBe("policy_check");
  });
});

describe("transition() — legal transitions per the spec state machine", () => {
  const legal: Array<[ConversationState, ConversationState]> = [
    ["greeted", "need_identified"],
    ["greeted", "handed_off"],
    ["greeted", "closed"],
    ["need_identified", "vehicle_known"],
    ["need_identified", "handed_off"],
    ["need_identified", "callback_requested"],
    ["need_identified", "closed"],
    ["vehicle_known", "slot_offered"],
    ["vehicle_known", "handed_off"],
    ["vehicle_known", "callback_requested"],
    ["slot_offered", "booked"],
    ["slot_offered", "need_identified"],
    ["slot_offered", "handed_off"],
    ["slot_offered", "callback_requested"],
    ["booked", "closed"],
    ["callback_requested", "closed"],
    ["handed_off", "closed"],
    ["closed", "closed"],
  ];

  test.each(legal)("%s -> %s succeeds", (from, to) => {
    expect(transition(from, to)).toBe(to);
  });

  test("every node's transitionsTo resolves through transition()", () => {
    for (const state of ALL_STATES) {
      const node: TaskNode = SMS_TASK_GRAPH[state];
      for (const next of node.transitionsTo) {
        expect(transition(state, next)).toBe(next);
      }
    }
  });
});

describe("transition() — illegal transitions throw", () => {
  const illegal: Array<[ConversationState, ConversationState]> = [
    ["greeted", "booked"],
    ["greeted", "vehicle_known"],
    ["need_identified", "booked"],
    ["vehicle_known", "booked"],
    ["vehicle_known", "closed"],
    ["booked", "handed_off"],
    ["booked", "need_identified"],
    ["callback_requested", "booked"],
    ["handed_off", "booked"],
    ["closed", "greeted"],
    ["closed", "need_identified"],
    ["closed", "booked"],
    ["closed", "handed_off"],
  ];

  test.each(illegal)("%s -> %s throws", (from, to) => {
    expect(() => transition(from, to)).toThrow(/Illegal transition/);
  });

  test("unknown state throws", () => {
    expect(() =>
      transition("greeted", "nonexistent" as ConversationState),
    ).toThrow(/Illegal transition/);
    expect(() => getNode("nonexistent" as ConversationState)).toThrow(
      /Unknown conversation state/,
    );
  });
});

describe("terminal state", () => {
  test("closed is the only terminal state", () => {
    expect(isTerminal("closed")).toBe(true);
    for (const state of ALL_STATES.filter((s) => s !== "closed")) {
      expect(isTerminal(state)).toBe(false);
    }
  });

  test("closed only transitions to itself", () => {
    expect(getNode("closed").transitionsTo).toEqual(["closed"]);
  });
});
