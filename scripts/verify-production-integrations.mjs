const mode = process.env.INTEGRATION_ENV || process.env.NODE_ENV || "development";
const allowMissing = process.env.ALLOW_MISSING_INTEGRATIONS === "true" || mode !== "production";
const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", "API Supabase URL", true],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "API Supabase publishable key", true],
  ["NEXT_PUBLIC_APP_URL", "application public URL", true],
  ["NEXT_PUBLIC_CORS_ORIGIN", "API CORS origin", true],
  ["SUPABASE_SERVICE_ROLE_KEY", "server Supabase service role key", true],
  ["CRON_SECRET", "Vercel lifecycle cron secret", true],
  ["RESEND_API_KEY", "Resend API key", false],
  ["RESEND_FROM_EMAIL", "Resend sender identity", false],
  ["RESEND_WEBHOOK_SIGNING_SECRET", "Resend webhook signing secret", false],
  ["TWILIO_ACCOUNT_SID", "Twilio account SID", false],
  ["TWILIO_AUTH_TOKEN", "Twilio auth token", false],
  ["TWILIO_FROM_NUMBER", "Twilio sender number", false],
  ["STRIPE_SECRET_KEY", "Stripe server secret", false],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", false],
  ["VITE_STRIPE_PUBLISHABLE_KEY", "Stripe frontend publishable key", false],
  ["SENTRY_DSN", "Sentry server DSN", false],
  ["VITE_SENTRY_DSN", "Sentry frontend DSN", false],
  ["VITE_POSTHOG_KEY", "PostHog browser key", false],
  ["VITE_POSTHOG_HOST", "PostHog host", false],
];

const missing = checks.filter(([name]) => !process.env[name]);
const origin = process.env.NEXT_PUBLIC_APP_URL;
const corsOrigin = process.env.NEXT_PUBLIC_CORS_ORIGIN;
const failures = [];

if (origin && !/^https:\/\//i.test(origin) && mode === "production") failures.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
if (corsOrigin && /\/$/.test(corsOrigin)) failures.push("NEXT_PUBLIC_CORS_ORIGIN must not have a trailing slash.");
if (origin && corsOrigin && new URL(origin).hostname === new URL(corsOrigin).hostname && origin !== corsOrigin) {
  console.warn("Warning: application URL and CORS origin differ in scheme or port; verify the browser API origin intentionally.");
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
