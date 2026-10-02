/**
 * ZeroPolicy — deterministic permission broker for the Shop Agent.
 *
 * Pure function: NO database access. Suppression state arrives via
 * ctx.optedOut (the caller queries messaging_suppressions); the workspace
 * local time arrives via ctx.localTimeMinutes.
 *
 * Implements the Phase 0 policy table exactly. Check order:
 *   1. suppression  → blocked ("policy.suppression.blocked")
 *   2. quiet hours   → blocked ("policy.quiet-hours.blocked")
 *   3. action table  → act / draft / blocked per action
 */
import type {
  PolicyAction,
  PolicyContext,
  PolicyDecision,
} from "./types";

// ---------------------------------------------------------------------------
// Quiet hours: 08:00 (inclusive) to 21:00 (exclusive), workspace-local.
// Minutes: 480 = 08:00, 1260 = 21:00.
// ---------------------------------------------------------------------------

export const QUIET_HOURS_START_MINUTES = 480;
export const QUIET_HOURS_END_MINUTES = 1260;

/**
 * True when the given workspace-local time falls inside quiet hours.
 * Boundary: 7:59 blocked, 8:00 allowed, 20:59 allowed, 21:00 blocked.
 */
export function isQuietHours(localTimeMinutes: number): boolean {
  return (
    localTimeMinutes < QUIET_HOURS_START_MINUTES ||
    localTimeMinutes >= QUIET_HOURS_END_MINUTES
  );
}

// ---------------------------------------------------------------------------
// STOP / HELP keyword matchers — trimmed, case-insensitive exact match.
// ---------------------------------------------------------------------------

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "QUIT",
  "CANCEL",
  "END",
]);

const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

function normalizeKeyword(body: string): string {
  return body.trim().toUpperCase();
}

export function isStopMessage(body: string): boolean {
  return STOP_KEYWORDS.has(normalizeKeyword(body));
}

export function isHelpMessage(body: string): boolean {
  return HELP_KEYWORDS.has(normalizeKeyword(body));
}

// ---------------------------------------------------------------------------
// Policy broker
// ---------------------------------------------------------------------------

function blocked(ruleId: string, reason: string): PolicyDecision {
  return { decision: "blocked", ruleId, reason };
}

export function checkPolicy(
  action: PolicyAction,
  ctx: PolicyContext,
): PolicyDecision {
  // 1. Suppression — an opted-out recipient gets no outbound message,
  //    regardless of anything else.
  if (action === "send_message" && ctx.optedOut === true) {
    return blocked(
      "policy.suppression.blocked",
      "recipient previously opted out (STOP honored); no outbound message",
    );
  }

  // 2. Quiet hours — no outbound message before 08:00 or at/after 21:00.
  //    Fail closed: if we don't know the local time, we can't prove we're
  //    outside quiet hours, so the send is blocked.
  if (action === "send_message") {
    if (ctx.localTimeMinutes === undefined) {
      return blocked(
        "policy.quiet-hours.blocked",
        "workspace-local time unknown; cannot prove the send is outside quiet hours (08:00–21:00)",
      );
    }
    if (isQuietHours(ctx.localTimeMinutes)) {
      return blocked(
        "policy.quiet-hours.blocked",
        "outside quiet-hours window (08:00–21:00 workspace-local)",
      );
    }
  }

  // 3. Action table.
  switch (action) {
    case "answer_faq":
      return {
        decision: "act",
        ruleId: "policy.faq.act",
        reason: "answering from canonical shop profile facts",
      };

    case "send_booking_confirmation":
      return {
        decision: "act",
        ruleId: "policy.booking-confirm.act",
        reason: "confirming an appointment that already exists",
      };

    case "create_appointment":
      if (ctx.withinBusinessHours === true && ctx.withinServiceArea === true) {
        return {
          decision: "act",
          ruleId: "policy.appointment.act",
          reason: "inside business hours and inside the service area",
        };
      }
      return blocked(
        "policy.appointment.blocked",
        `appointment creation requires inside business hours AND inside service area (hours=${String(ctx.withinBusinessHours)}, area=${String(ctx.withinServiceArea)})`,
      );

    case "quote_price":
      if (ctx.priceFromProfile === true) {
        return {
          decision: "act",
          ruleId: "policy.quote.act",
          reason: "price comes from the canonical shop profile",
        };
      }
      return blocked(
        "policy.quote.no-invented-prices",
        "price is not from the shop profile; never invent prices",
      );

    case "promise_callback":
      return {
        decision: "act",
        ruleId: "policy.callback.act",
        reason: "offering a human callback",
      };

    case "offer_discount":
      return {
        decision: "draft",
        ruleId: "policy.discount.draft",
        reason: "discounts and price changes need human approval",
      };

    case "send_message":
      return {
        decision: "act",
        ruleId: "policy.send.act",
        reason: "recipient not opted out and inside quiet-hours window",
      };

    default: {
      // Exhaustiveness guard — fail closed on unknown actions.
      const _exhaustive: never = action;
      return blocked(
        "policy.unknown-action.blocked",
        `unknown policy action: ${String(_exhaustive)}`,
      );
    }
  }
}
