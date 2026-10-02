/**
 * ZeroAI model boundary — the ONLY place a model touches the system.
 *
 * Architecture: "Inference proposes. Deterministic systems decide."
 * Nothing here calls a model provider, a database, or a tool. The
 * NoopReasoner is the SAFE DEFAULT: without a configured model the agent
 * hands off instead of hallucinating a reply.
 */
import type { ModelReasoner, ReasonInput, ReasonOutput } from "./types";
import { MAX_SMS_CHARS } from "./registry";

export { MAX_SMS_CHARS };

/** Safe default reply for the no-model case. Short, plain-spoken, ≤ 320 chars. */
export const NOOP_HANDOFF_MESSAGE =
  "Thanks for reaching out — I can't help by text right now, so I'm handing " +
  "this to the shop team. They'll get back to you shortly. If it's urgent, " +
  "please call the shop directly.";

/** Clamp a reply to the SMS length limit without breaking a surrogate pair. */
function clampReply(reply: string): string {
  if (reply.length <= MAX_SMS_CHARS) return reply;
  return reply.slice(0, MAX_SMS_CHARS);
}

export class NoopReasoner implements ModelReasoner {
  readonly name = "noop";

  /** @param handoffMessage optional custom handoff text; defaults to the safe one. */
  constructor(private readonly handoffMessage: string = NOOP_HANDOFF_MESSAGE) {}

  async reason(_input: ReasonInput): Promise<ReasonOutput> {
    return {
      reply: clampReply(this.handoffMessage),
      extractedFacts: {},
      suggestedState: "handed_off",
      confidence: 0,
      handoffReason: "no model configured",
    };
  }
}

/** A deterministic scripted rule for StubReasoner: match against the summary. */
export interface StubRule {
  /**
   * Case-insensitive substring matched against `input.summary`.
   * A null/undefined match matches any input.
   */
  match?: string | null;
  output: ReasonOutput;
}

/**
 * Deterministic, network-free reasoner for tests and local development.
 * Returns the first rule whose `match` appears in the input summary;
 * when nothing matches, the last rule is the fallback (hand off if none).
 */
export class StubReasoner implements ModelReasoner {
  readonly name = "stub";

  constructor(private readonly rules: StubRule[] = []) {}

  private static matches(rule: StubRule, input: ReasonInput): boolean {
    if (rule.match == null) return true;
    return input.summary.toLowerCase().includes(rule.match.toLowerCase());
  }

  async reason(input: ReasonInput): Promise<ReasonOutput> {
    const rule =
      this.rules.find((r) => StubReasoner.matches(r, input)) ??
      this.rules[this.rules.length - 1];

    if (!rule) {
      return {
        reply: clampReply(NOOP_HANDOFF_MESSAGE),
        extractedFacts: {},
        suggestedState: "handed_off",
        confidence: 0,
        handoffReason: "stub script exhausted",
      };
    }

    const out = rule.output;
    return {
      ...out,
      reply: clampReply(out.reply),
    };
  }
}
