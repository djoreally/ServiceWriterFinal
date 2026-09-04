import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const contract = JSON.parse(read("scripts/architecture-contract.json"));
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));

assert(contract.application?.runtime === "Next.js App Router", "Architecture contract must declare Next.js App Router.");
assert(contract.application?.deployment_model === "single Vercel project", "Architecture contract must declare one Vercel production project.");
assert(contract.data_platform?.tenant_key === "workspace_id", "Canonical tenant key must be workspace_id.");
assert(contract.provider_ownership?.transactional_email === "Resend", "Transactional email must be owned by Resend.");
assert(contract.provider_ownership?.growth_marketing_email === "Enginemailer", "Growth/marketing email must be owned by Enginemailer.");

assert(pkg.scripts?.dev === "next dev", "package.json dev runtime must be Next.js.");
assert(pkg.scripts?.build === "next build", "package.json build runtime must be Next.js.");
assert(pkg.scripts?.start === "next start", "package.json production runtime must be Next.js.");
assert(pkg.scripts?.prebuild === "node scripts/check-architecture-contract.mjs", "Every production build must run the architecture contract first.");
assert(pkg.engines?.node === "24.x", "Node runtime must remain pinned to 24.x.");
assert(Boolean(pkg.dependencies?.next), "Next.js must be a production dependency.");
assert(vercel.framework === "nextjs", "vercel.json must declare framework=nextjs.");
assert(vercel.buildCommand === "npm run build", "Vercel must use the canonical Next.js build command.");

for (const file of ["app/layout.tsx", "app/[[...path]]/page.tsx", "src/ClientOnlyShell.tsx", "src/NextClientShell.tsx", "src/App.tsx"]) {
  assert(exists(file), `Missing canonical application surface: ${file}`);
}
for (const forbidden of ["vite.config.ts", "vite.config.js", "vite.config.mjs", "apps/web-next", "apps/api"]) {
  assert(!exists(forbidden), `Competing runtime surface is forbidden: ${forbidden}`);
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "coverage", "test-results", "__tests__"].includes(entry.name)) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

for (const file of [...walk("app"), ...walk("src"), ...walk("packages"), "next.config.ts"]) {
  const content = read(file);
  if (/\bimport\.meta\.env\b/.test(content)) failures.push(`${file}: import.meta.env is forbidden in canonical runtime code.`);
  if (/\bprocess\.env\.VITE_[A-Z0-9_]+\b/.test(content)) failures.push(`${file}: direct VITE_* environment access is forbidden.`);
}

const runtimeEnv = read("src/lib/runtime-env.ts");
assert(runtimeEnv.includes("return key.startsWith('VITE_') ? `NEXT_PUBLIC_${key.slice('VITE_'.length)}` : key;"),
  "Historical VITE_* call-site aliases must resolve only to NEXT_PUBLIC_* values, never Vite environment values.");

const lifecycle = read("src/server/messaging/lifecycle-sender.ts");
assert(/purpose\s*===\s*["']marketing["']\s*\?\s*new EnginemailerEmailAdapter\(\)\s*:\s*new ResendEmailAdapter\(\)/.test(lifecycle),
  "Lifecycle provider selector must use Enginemailer for marketing and Resend otherwise.");

const testEmail = read("app/api/v1/email-testing/send/route.ts");
assert(testEmail.includes("ResendEmailAdapter"), "Send Test Email must use the Resend transactional adapter.");
assert(!testEmail.includes("ENGINEMAILER_"), "Send Test Email may not bypass the transactional provider boundary through Enginemailer.");

const envExample = read(".env.example");
assert(envExample.includes("RESEND_API_KEY="), ".env.example must declare Resend transactional credentials.");
assert(envExample.includes("ENGINEMAILER_API_KEY="), ".env.example must declare Enginemailer marketing credentials.");

const canonicalDocs = [
  "docs/application-architecture-baseline.md",
  "docs/environment-and-secrets-manifest.md",
];
for (const file of canonicalDocs) {
  const content = read(file);
  for (const stale of ["Vite frontend", "split deployment", "apps/web-next", "VITE_SUPABASE_URL"]) {
    if (content.includes(stale)) failures.push(`${file}: stale architecture phrase remains: ${stale}`);
  }
}

if (failures.length) {
  console.error("Architecture contract verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Architecture contract passed: single Next.js/Vercel runtime, workspace tenancy, and provider ownership are consistent.");
