import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const platform = read("src/server/hono/routes/platform.ts");
const gate = read("src/hooks/useAppAccessGate.ts");
const startup = read("src/lib/resolveStartupRoute.ts");
const onboardingPage = read("src/legacy-pages/Onboarding.tsx");
const guards = read("src/components/routing/legacy-guards.tsx");
const billing = read("src/server/hono/routes/billing.ts");

const checks = [
  ["app access gate no longer calls onboarding status", !gate.includes("/v1/platform/onboarding/status")],
  ["app access gate never returns onboarding_required", !gate.includes("onboarding_required")],
  ["startup routing does not redirect to onboarding", !startup.includes('return currentPath === "/onboarding" ? currentPath : "/onboarding"')],
  ["retired onboarding route redirects to business setup", onboardingPage.includes('<Navigate to="/settings?tab=business&setup=1" replace />')],
  ["plan feature gate routes to plans instead of onboarding", guards.includes('<Navigate to="/plans" replace />') && !guards.includes('<Navigate to="/onboarding" replace />')],
  ["compatibility onboarding status reports completed", platform.includes("onboardingCompleted: true") && platform.includes("sunset: true")],
  ["dashboard onboarding info cannot re-enable wizard", platform.includes('platformRouter.get("/v1/platform/dashboard/onboarding-info"') && platform.includes("onboardingCompleted: true")],
  ["security events use audit_events", platform.includes('.from("audit_events").insert')],
  ["security events no longer call missing RPC", !platform.includes('rpc("record_auth_security_event_v1"')],
  ["pre-workspace subscription read is non-error provisional basic", billing.includes('error.code === "billing_workspace_missing"') && billing.includes("provisional: true") && billing.includes('plan_tier: "basic"')],
  ["explicit unauthorized billing workspace still fails closed", billing.includes("if (!workspaceId && error instanceof ApiError") && billing.includes("throw error;")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (failed.length) {
  console.error(`\nONBOARDING SUNSET CERTIFICATION FAILED: ${failed.length} invariant(s) violated.`);
  process.exit(1);
}
console.log(`\nONBOARDING SUNSET CERTIFIED: ${checks.length}/${checks.length} invariants passed.`);
