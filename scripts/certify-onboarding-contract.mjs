import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const platform = read("src/server/hono/routes/platform.ts");
const wizard = read("src/components/onboarding/OnboardingWizard.tsx");
const gate = read("src/hooks/useAppAccessGate.ts");
const commands = read("src/application/commands/onboarding-wizard.command.ts");
const billing = read("src/server/hono/routes/billing.ts");

const start = platform.indexOf("// Onboarding (canonical workspace-backed contract)");
const end = platform.indexOf("// Dashboard (migrated from dashboard.query.ts", start);
if (start < 0 || end < 0) throw new Error("Canonical onboarding section not found");
const onboarding = platform.slice(start, end);

const checks = [
  ["onboarding has no retired business_profiles dependency", !onboarding.includes('"business_profiles"')],
  ["onboarding has no legacy service_catalog.default_price write", !onboarding.includes("default_price")],
  ["profile persists through workspaces", onboarding.includes('.from("workspaces")')],
  ["profile persists through workspace_settings", onboarding.includes('.from("workspace_settings")')],
  ["services persist workspace_id", onboarding.includes("workspace_id: workspaceId")],
  ["services use labor_price", onboarding.includes("labor_price: service.price")],
  ["services use estimated_minutes", onboarding.includes("estimated_minutes: service.duration_minutes")],
  ["profile write re-reads persisted state", onboarding.includes("loadCanonicalOnboardingProfile(supabase, user.id)")],
  ["completion rejects unverifiable persistence", onboarding.includes("onboarding_verify_failed")],
  ["completion rejects incomplete required state", onboarding.includes("onboarding_requirements_incomplete")],
  ["wizard advances only after verified save", wizard.includes("if (verified) setCurrentStep")],
  ["wizard complete state is persistence-gated", wizard.includes("if (verified) setCurrentStep(STEP_DONE)")],
  ["wizard does not send client-controlled user_id", !wizard.includes("user_id: userId")],
  ["command requires server verification", commands.includes("if (!result.success || !result.verified)")],
  ["service command requires verification", commands.includes("if (!result.verified)")],
  ["app access gate reads verified onboarding endpoint", gate.includes('"/v1/platform/onboarding/status"')],
  ["app access gate no longer uses direct workspace DB membership as completion", !gate.includes("productionSupabase")],
  ["app access gate fails closed to onboarding", gate.includes('reason: "onboarding_required", redirectTo: "/onboarding"')],
  ["security events use audit_events", platform.includes('.from("audit_events").insert')],
  ["security events no longer call missing RPC", !platform.includes('rpc("record_auth_security_event_v1"')],
  ["dashboard onboarding info uses canonical profile", platform.includes('platformRouter.get("/v1/platform/dashboard/onboarding-info"') && platform.includes("const canonical = await loadCanonicalOnboardingProfile(supabase, user.id);")],
  ["pre-workspace subscription read is non-error provisional basic", billing.includes('error.code === "billing_workspace_missing"') && billing.includes("provisional: true") && billing.includes('plan_tier: "basic"')],
  ["explicit unauthorized billing workspace still fails closed", billing.includes("if (!workspaceId && error instanceof ApiError") && billing.includes("throw error;")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (failed.length) {
  console.error(`\nONBOARDING CERTIFICATION FAILED: ${failed.length} invariant(s) violated.`);
  process.exit(1);
}
console.log(`\nONBOARDING CONTRACT CERTIFIED: ${checks.length}/${checks.length} invariants passed.`);
