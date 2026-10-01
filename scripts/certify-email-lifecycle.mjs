import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const templatesPath = "src/server/messaging/lifecycle-templates.ts";
const eventsPath = "src/server/messaging/lifecycle-events.ts";
const senderPath = "src/server/messaging/lifecycle-sender.ts";
const templateTestPath = "src/server/messaging/lifecycle-templates.test.ts";
const resendPath = "src/server/messaging/resend.ts";
const enginemailerPath = "src/server/messaging/enginemailer.ts";

for (const file of [
  templatesPath,
  eventsPath,
  senderPath,
  templateTestPath,
  resendPath,
  enginemailerPath,
  "app/api/v1/webhooks/resend/route.ts",
  "app/api/v1/webhooks/enginemailer/route.ts",
  "app/api/v1/newsletter/preferences/route.ts",
  "app/api/v1/email-testing/send/route.ts",
]) assert(exists(file), `Missing canonical email surface: ${file}`);

const templates = read(templatesPath);
const baseStart = templates.indexOf("const BASE_LIFECYCLE_TEMPLATES");
const overrideStart = templates.indexOf("const LIFECYCLE_TEMPLATE_OVERRIDES");
const mergedStart = templates.indexOf("export const LIFECYCLE_TEMPLATES");
assert(baseStart >= 0 && overrideStart > baseStart && mergedStart > overrideStart, "Lifecycle template registry blocks are malformed.");

const keyPattern = /^\s*"([a-z0-9_]+\.[a-z0-9_]+)"\s*:\s*\{/gm;
const baseKeys = [...templates.slice(baseStart, overrideStart).matchAll(keyPattern)].map((m) => m[1]);
const overrideKeys = [...templates.slice(overrideStart, mergedStart).matchAll(keyPattern)].map((m) => m[1]);
const mergedKeys = [...new Set([...baseKeys, ...overrideKeys])];
const overrideOnly = overrideKeys.filter((key) => !baseKeys.includes(key));

assert(baseKeys.length === 175, `Expected 175 base lifecycle emails, found ${baseKeys.length}.`);
assert(new Set(baseKeys).size === baseKeys.length, "Base lifecycle email keys must be unique.");
assert(overrideKeys.length === 14, `Expected 14 template overrides, found ${overrideKeys.length}.`);
assert(new Set(overrideKeys).size === overrideKeys.length, "Lifecycle override keys must be unique.");
assert(mergedKeys.length === 177, `Expected 177 deliverable lifecycle emails after overrides, found ${mergedKeys.length}.`);
assert(overrideOnly.length === 2, `Expected exactly two staff-only override additions, found ${overrideOnly.length}.`);
assert(overrideOnly.includes("quotes_and_service_authorization.quote_approved_staff"), "Missing quote-approved staff email.");
assert(overrideOnly.includes("quotes_and_service_authorization.quote_declined_staff"), "Missing quote-declined staff email.");

const events = read(eventsPath);
assert(events.includes("Object.keys(LIFECYCLE_TEMPLATES)"), "Lifecycle event catalog must derive from the canonical template registry.");
assert(events.includes("idempotencyKey: `lifecycle:${template.key}:${event.eventId}:${event.recipientEmail.toLowerCase()}`"), "Lifecycle dispatch must use recipient-scoped idempotency.");
assert(events.includes("enqueueLifecycleEmail"), "Lifecycle events must flow through the outbox.");

const templateTests = read(templateTestPath);
assert(templateTests.includes("expect(LIFECYCLE_TEMPLATE_COUNT).toBe(177)"), "Template test must assert all 177 deliverable emails.");
assert(templateTests.includes("for (const template of Object.values(LIFECYCLE_TEMPLATES))"), "Template test must render every lifecycle email.");
assert(templateTests.includes("rejects unresolved variables before delivery"), "Template tests must reject unresolved merge variables.");
assert(templateTests.includes("requires a preferences link for consent-gated marketing email"), "Marketing template tests must enforce a preferences/unsubscribe URL.");

const sender = read(senderPath);
for (const required of [
  'purpose === "marketing" ? new EnginemailerEmailAdapter() : new ResendEmailAdapter()',
  'messaging_has_active_suppression',
  'messaging_consents',
  'idempotency_key',
  'provider_message_id',
  'status: "canceled"',
  'failure_code: rendered.purpose === "marketing" ? "consent_required" : "suppressed"',
]) assert(sender.includes(required), `Lifecycle sender is missing required delivery control: ${required}`);
assert(sender.includes('rendered.purpose !== "marketing"'), "Marketing email may not use transactional fallback behavior.");

const resend = read(resendPath);
for (const required of ["html", "text", "reply_to", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) {
  assert(resend.includes(required), `Resend adapter missing required contract: ${required}`);
}

const enginemailer = read(enginemailerPath);
for (const required of ["ENGINEMAILER_API_KEY", "ENGINEMAILER_FROM_EMAIL", "addupdatesubscriber", "unsubscribe", "bounce", "spam"]) {
  assert(enginemailer.toLowerCase().includes(required.toLowerCase()), `Enginemailer adapter missing required contract: ${required}`);
}

const testEmail = read("app/api/v1/email-testing/send/route.ts");
assert(testEmail.includes("ResendEmailAdapter"), "Send Test Email must use the transactional Resend adapter.");
assert(!testEmail.includes("ENGINEMAILER_"), "Send Test Email must not bypass the provider boundary.");

const preferenceRoute = read("app/api/v1/newsletter/preferences/route.ts");
assert(preferenceRoute.includes("unsubscribe"), "Newsletter preference route must support unsubscribe.");
assert(preferenceRoute.includes("Subscribe again"), "Newsletter preference route must support resubscribe.");
assert(preferenceRoute.includes("Appointment confirmations and required service messages are separate"), "Preference center must distinguish transactional from marketing email.");

const criticalProducers = [
  ["appointment_booking_sequence.booking_confirmation", "src/server/messaging/booking-confirmation.ts"],
  ["appointment_booking_sequence.new_appointment_booked", "src/server/messaging/booking-confirmation.ts"],
  ["appointment_booking_sequence.appointment_rescheduled", "app/api/v1/appointments/[id]/route.ts"],
  ["appointment_booking_sequence.appointment_cancelled", "app/api/v1/appointments/[id]/route.ts"],
  ["appointment_booking_sequence.assignment_changed", "app/api/v1/dispatch/assign/route.ts"],
  ["quotes_and_service_authorization.your_quote_is_ready", "app/api/v1/quotes/[id]/status/route.ts"],
  ["quotes_and_service_authorization.quote_approved", "app/api/v1/quotes/[id]/status/route.ts"],
  ["quotes_and_service_authorization.quote_declined", "app/api/v1/quotes/[id]/status/route.ts"],
  ["invoice_and_payment_sequence.invoice_created", "src/server/messaging/invoice-events.ts"],
  ["invoice_and_payment_sequence.payment_requested", "app/api/v1/payments/actions/route.ts"],
  ["invoice_and_payment_sequence.payment_receipt", "app/api/v1/payments/route.ts"],
  ["invoice_and_payment_sequence.payment_failed", "app/api/v1/payments/[id]/route.ts"],
  ["invoice_and_payment_sequence.refund_issued", "app/api/v1/payments/[id]/route.ts"],
  ["service_completion_and_follow_up.service_completion_summary", "app/api/v1/appointments/[id]/complete/route.ts"],
  ["service_completion_and_follow_up.review_and_satisfaction_request", "app/api/v1/reviews/actions/route.ts"],
  ["staff_onboarding_and_account_management.you_ve_been_invited", "src/server/invitations/mailer.ts"],
];

const eventConstantByKey = new Map(
  [...events.matchAll(/^\s*([A-Za-z0-9_]+):\s*"([a-z0-9_]+\.[a-z0-9_]+)"/gm)].map((m) => [m[2], m[1]]),
);

for (const [key, producer] of criticalProducers) {
  assert(mergedKeys.includes(key), `Critical producer references unknown template: ${key}`);
  assert(exists(producer), `Missing authoritative email producer: ${producer}`);
  if (!exists(producer)) continue;
  const source = read(producer);
  const constantName = eventConstantByKey.get(key);
  const wired = source.includes(key) || (constantName && source.includes(`LIFECYCLE_EVENT_KEYS.${constantName}`));
  assert(Boolean(wired), `${key} is not wired from its authoritative producer ${producer}`);
}

const marketingSetBlock = templates.slice(
  templates.indexOf("const MARKETING_TEMPLATE_KEYS"),
  templates.indexOf("export type LifecycleTemplateKey"),
);
const marketingKeys = [...marketingSetBlock.matchAll(/"([a-z0-9_]+\.[a-z0-9_]+)"/g)].map((m) => m[1]);
assert(marketingKeys.length > 0, "Marketing template allowlist is empty.");
for (const key of marketingKeys) assert(mergedKeys.includes(key), `Marketing allowlist contains unknown template: ${key}`);

if (failures.length) {
  console.error("Email lifecycle certification FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  deliverableTemplates: mergedKeys.length,
  baseTemplates: baseKeys.length,
  overrides: overrideKeys.length,
  marketingTemplates: marketingKeys.length,
  criticalAuthoritativeProducers: criticalProducers.length,
  transactionalProvider: "Resend",
  marketingProvider: "Enginemailer",
  suppressionAndConsent: true,
  recipientScopedIdempotency: true,
  preferenceCenter: true,
  exhaustiveRenderTest: true,
}, null, 2));
