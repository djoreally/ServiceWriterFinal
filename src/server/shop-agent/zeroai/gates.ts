/**
 * ZeroAI gates — named, deterministic checks on important transitions.
 *
 * A gate either passes or returns a reason; callers BLOCK the transition on
 * failure, never proceed. Nothing here calls a model.
 *
 * `policy_check` delegates to the ZeroPolicy broker in `./policy`.
 */
import type {
  GateName,
  GateResult,
  PolicyAction,
  PolicyContext,
  ShopProfile,
} from "./types";
import { checkPolicy } from "./policy";

/** Profile completeness score (0..100) required before a workspace goes live. */
export const PROFILE_GO_LIVE_THRESHOLD = 80;

export interface GateContext {
  profile?: ShopProfile;
  policyAction?: PolicyAction;
  policyCtx?: PolicyContext;
  slots?: unknown[];
  /** For appointment_verified: resolves true when the appointment id is real. */
  appointmentId?: string;
  appointmentLookup?: (id: string) => Promise<boolean>;
}

function pass(gate: GateName, reason: string): GateResult {
  return { gate, passed: true, reason };
}

function fail(gate: GateName, reason: string): GateResult {
  return { gate, passed: false, reason };
}

/**
 * Evaluate a named gate. Always resolves to a GateResult — a failure is
 * { passed: false, reason }, never an exception, so callers can block
 * the transition with evidence.
 */
export async function checkGate(
  gate: GateName,
  ctx: GateContext,
): Promise<GateResult> {
  switch (gate) {
    case "profile_complete": {
      const score = ctx.profile?.completenessScore;
      if (score === undefined) {
        return fail(gate, "no shop profile provided — cannot assess completeness");
      }
      if (score >= PROFILE_GO_LIVE_THRESHOLD) {
        return pass(
          gate,
          `completeness score ${score} meets go-live threshold ${PROFILE_GO_LIVE_THRESHOLD}`,
        );
      }
      return fail(
        gate,
        `completeness score ${score} below go-live threshold ` +
          `${PROFILE_GO_LIVE_THRESHOLD}; missing fields: ` +
          `${ctx.profile?.missingFields?.join(", ") || "unknown"}`,
      );
    }

    case "policy_check": {
      if (!ctx.policyAction) {
        return fail(gate, "no policy action provided");
      }
      const policyCtx: PolicyContext | undefined =
        ctx.policyCtx ??
        (ctx.profile
          ? { workspaceId: ctx.profile.workspaceId }
          : undefined);
      if (!policyCtx) {
        return fail(
          gate,
          "no policy context (or shop profile to derive the workspace from) provided",
        );
      }
      const decision = await checkPolicy(ctx.policyAction, policyCtx);
      if (decision.decision === "act") {
        return pass(
          gate,
          `policy approved: ${decision.ruleId} — ${decision.reason}`,
        );
      }
      return fail(
        gate,
        `policy ${decision.decision}: ${decision.reason} ` +
          `(rule ${decision.ruleId}) — approval or correction required before proceeding`,
      );
    }

    case "slot_exists": {
      if (ctx.slots && ctx.slots.length > 0) {
        return pass(gate, `${ctx.slots.length} slot(s) available from the booking system`);
      }
      return fail(
        gate,
        "no slots available from the booking system — cannot offer invented slots",
      );
    }

    case "appointment_verified": {
      if (!ctx.appointmentLookup) {
        return fail(gate, "no appointment lookup provided");
      }
      if (!ctx.appointmentId) {
        return fail(gate, "no appointment id provided to verify");
      }
      const verified = await ctx.appointmentLookup(ctx.appointmentId);
      if (verified) {
        return pass(gate, `appointment ${ctx.appointmentId} verified`);
      }
      return fail(
        gate,
        `appointment ${ctx.appointmentId} could not be verified — ` +
          "cannot confirm a booking that does not exist",
      );
    }

    default: {
      // Exhaustiveness guard: unknown gate names fail closed.
      const unknown: never = gate;
      return fail("profile_complete", `unknown gate: ${String(unknown)}`);
    }
  }
}
