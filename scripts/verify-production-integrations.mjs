const mode = process.env.INTEGRATION_ENV || process.env.NODE_ENV || "development";
const allowMissing = process.env.ALLOW_MISSING_INTEGRATIONS === "true" || mode !== "production";
const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", "canonical Supabase URL", true],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Supabase browser publishable key", true],
  ["NEXT_PUBLIC_SUPABASE_PROJECT_ID", "canonical Supabase project ref", true],
  ["NEXT_PUBLIC_API_BASE_URL", "same-origin Next.js API base", true],
  ["NEXT_PUBLIC_APP_URL", "application public URL", true],
  ["NEXT_PUBLIC_CORS_ORIGIN", "API CORS origin", true],
  ["SUPABASE_SERVICE_ROLE_KEY", "server Supabase service role key", true],
  ["CRON_SECRET", "Vercel background-worker secret", true],
  ["RESEND_API_KEY", "Resend transactional API key", true],
  ["RESEND_FROM_EMAIL", "Resend transactional verified sender", true],
  ["RESEND_WEBHOOK_SIGNING_SECRET", "Resend transactional webhook signing secret", true],
  ["ENGINEMAILER_API_KEY", "Enginemailer growth/marketing API key and transactional fallback", true],
  ["ENGINEMAILER_FROM_EMAIL", "Enginemailer verified sender", true],
  ["ENGINEMAILER_WEBHOOK_SIGNING_SECRET", "Enginemailer HMAC webhook secret", true],
  ["ENGINEMAILER_TRANSACTIONAL_API_KEY", "optional Enginemailer least-privilege fallback key", false],
  ["ENGINEMAILER_TRANSACTIONAL_FROM_EMAIL", "optional Enginemailer fallback sender override", false],
  ["ENGINEMAILER_MARKETING_FROM_EMAIL", "optional Enginemailer marketing sender override", false],
  ["ENGINEMAILER_MARKETING_SUBCATEGORY_IDS", "optional Enginemailer marketing subscriber categories", false],
  ["TWILIO_ACCOUNT_SID", "SMS provider account SID", false],
  ["TWILIO_AUTH_TOKEN", "SMS provider auth token", false],
  ["TWILIO_FROM_NUMBER", "SMS sender number", false],
  ["STRIPE_SECRET_KEY", "Stripe server secret", false],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", false],
  ["SENTRY_DSN", "Sentry server DSN", false],
  ["SENTRY_AUTH_TOKEN", "Sentry server auth token", false],
];

const missing = checks.filter(([name]) => !process.env[name]);
const origin = process.env.NEXT_PUBLIC_APP_URL;
const corsOrigin = process.env.NEXT_PUBLIC_CORS_ORIGIN;
const failures = [];

if (origin && !/^https:\/\//i.test(origin) && mode === "production") failures.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
if (corsOrigin && /\/$/.test(corsOrigin)) failures.push("NEXT_PUBLIC_CORS_ORIGIN must not have a trailing slash.");
if (origin && corsOrigin && new URL(origin).hostname === new URL(corsOrigin).hostname && origin !== corsOrigin) {
  console.warn("Warning: application URL and CORS origin differ in scheme or port; verify this is intentional.");
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID) {
  const expectedHost = `${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID}.supabase.co`;
  try {
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== expectedHost) {
      failures.push("Supabase URL and project ref do not identify the same project.");
    }
  } catch {
    failures.push("NEXT_PUBLIC_SUPABASE_URL is invalid.");
  }
}
for (const name of Object.keys(process.env)) {
  if (/^VITE_/i.test(name)) failures.push(`${name} is a retired Vite environment variable and is not allowed in the canonical deployment.`);
}

for (const [name, label, required] of checks) {
  const present = Boolean(process.env[name]);
  const state = present ? "SET" : required ? "MISSING_REQUIRED" : "OPTIONAL_NOT_SET";
  console.log(`${name}\t${state}\t${label}`);
  if (!present && required && !allowMissing) failures.push(`${name} is required for ${mode}.`);
}
if (failures.length) {
  console.error("Production integration verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Integration contract verification passed in ${mode} mode${missing.length ? " with development-allowed omissions" : ""}.`);
