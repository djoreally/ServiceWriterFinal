const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || "development";
const allowMissing = process.env.ALLOW_MISSING_ENV === "true" || environment !== "production";
const requiredPublic = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CORS_ORIGIN",
];
const requiredServer = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_WEBHOOK_SIGNING_SECRET",
  "ENGINEMAILER_API_KEY",
  "ENGINEMAILER_FROM_EMAIL",
  "ENGINEMAILER_WEBHOOK_SIGNING_SECRET",
];
const optionalServer = [
  "ENGINEMAILER_TRANSACTIONAL_API_KEY", "ENGINEMAILER_TRANSACTIONAL_FROM_EMAIL",
  "ENGINEMAILER_MARKETING_FROM_EMAIL", "ENGINEMAILER_MARKETING_SUBCATEGORY_IDS",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SENTRY_DSN", "SENTRY_AUTH_TOKEN",
];
const forbiddenClientPatterns = [
  /^NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE_KEY|AUTH_TOKEN)$/i,
  /^VITE_/i,
];
const failures = [];

for (const name of [...requiredPublic, ...requiredServer, ...optionalServer]) {
  const present = Boolean(process.env[name]);
  const required = requiredPublic.includes(name) || requiredServer.includes(name);
  console.log(`${name}\t${present ? "SET" : required ? "MISSING_REQUIRED" : "OPTIONAL_NOT_SET"}`);
  if (!present && required && !allowMissing) failures.push(`${name} is required for ${environment}.`);
}
for (const name of Object.keys(process.env)) {
  if (forbiddenClientPatterns.some((pattern) => pattern.test(name))) {
    failures.push(`${name} violates the canonical single-Next.js environment contract.`);
  }
}
if (process.env.NEXT_PUBLIC_APP_URL && environment === "production" && !/^https:\/\//i.test(process.env.NEXT_PUBLIC_APP_URL)) {
  failures.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
}
if (process.env.NEXT_PUBLIC_CORS_ORIGIN && /\/$/.test(process.env.NEXT_PUBLIC_CORS_ORIGIN)) {
  failures.push("NEXT_PUBLIC_CORS_ORIGIN must not have a trailing slash.");
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID) {
  const expectedHost = `${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID}.supabase.co`;
  try {
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== expectedHost) {
      failures.push("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PROJECT_ID must identify the same project.");
    }
  } catch {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
}

if (failures.length) {
  console.error("Environment manifest verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Environment manifest passed in ${environment} mode${allowMissing ? " with development-allowed omissions" : ""}.`);
