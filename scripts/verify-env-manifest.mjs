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
const requiredServer = ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
const optionalServer = [
  "RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_WEBHOOK_SIGNING_SECRET",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SENTRY_DSN", "SENTRY_AUTH_TOKEN",
];
const forbiddenClientPatterns = [
  /^NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE_KEY|AUTH_TOKEN)$/i,
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
    failures.push(`${name} is a secret-like variable with a client-exposed prefix.`);
  }
}
if (process.env.NEXT_PUBLIC_APP_URL && environment === "production" && !/^https:\/\//i.test(process.env.NEXT_PUBLIC_APP_URL)) {
  failures.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
}
if (process.env.NEXT_PUBLIC_CORS_ORIGIN && /\/$/.test(process.env.NEXT_PUBLIC_CORS_ORIGIN)) {
  failures.push("NEXT_PUBLIC_CORS_ORIGIN must not have a trailing slash.");
}

if (failures.length) {
  console.error("Environment manifest verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Environment manifest passed in ${environment} mode${allowMissing ? " with development-allowed omissions" : ""}.`);
