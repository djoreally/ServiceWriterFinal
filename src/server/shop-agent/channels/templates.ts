/**
 * Shop Agent Phase 1 SMS templates (shop voice).
 *
 * Source: ~/workspace/shop-agent/phase-1-sms-spec.md sections 2 and 3.
 * Placeholders are filled from the workspace's ShopProfile at send time —
 * templates never invent business names, prices, or slots.
 */

export const TEXTBACK_TEMPLATE =
  "Hey, it's {businessName} — sorry we missed your call. What do you need? (oil change, brakes, etc.)";

export const NUDGE_TEMPLATE = "Still need a hand? Reply here and I'll get you sorted.";

export const STOP_CONFIRM_TEMPLATE =
  "You're opted out of texts from {businessName}. Reply START to rejoin.";

export const START_CONFIRM_TEMPLATE =
  "You're back on texts from {businessName}. Reply STOP to opt out anytime.";

export const HELP_TEMPLATE = "You're texting {businessName} at {phone}. Reply STOP to opt out.";

export const HANDOFF_CALLBACK_TEMPLATE =
  "Thanks for your patience — I'm handing this to the shop team. They'll call you back {callbackPromise}. If it's urgent, call {Phone}.";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  );
}
