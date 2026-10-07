import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const requireFile = (file, reason) => {
  if (!exists(file)) failures.push(`${reason}: missing ${file}`);
};
const requireText = (file, text, reason) => {
  requireFile(file, reason);
  if (exists(file) && !read(file).includes(text)) failures.push(`${reason}: ${file} missing ${JSON.stringify(text)}`);
};
const forbidText = (file, text, reason) => {
  requireFile(file, reason);
  if (exists(file) && read(file).includes(text)) failures.push(`${reason}: ${file} must not contain ${JSON.stringify(text)}`);
};

// REG-001/002/003 — public booking route precedence. Static booking command
// routes must remain explicit so Next's dynamic [id] route cannot swallow them.
for (const name of ["booking-progress", "booking-recovered", "booking-rpc"]) {
  const file = `app/api/v1/appointments/${name}/route.ts`;
  requireText(file, "export const POST", `public booking ${name} route precedence`);
}
requireFile("src/server/__tests__/api-routes/booking-route-precedence.test.ts", "public booking route precedence regression test");

// REG-004 — Settings deep links. Current and historic URLs must resolve to one
// of the supported Settings groups instead of rendering an empty Radix panel.
const settingsPage = "app/(app)/settings/page.tsx";
for (const legacyTab of ["profile", "regional", "hours", "availability", "tax", "billing", "email", "sms", "calendar", "offline", "gdpr"]) {
  requireText(settingsPage, `${legacyTab}:`, `settings legacy tab ${legacyTab}`);
}
requireText(settingsPage, 'SETTINGS_TAB_ALIASES[requestedTab] ?? "business"', "settings invalid-tab fallback");

// REG-005/006 — Settings mobile/tablet save controls must remain reachable.
requireText(settingsPage, "bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom))", "settings mobile save bar clearance");
requireText(settingsPage, "@media (min-width: 768px) and (max-width: 1023px)", "settings tablet breakpoint");
requireText(settingsPage, "left: 0 !important", "settings tablet save bar alignment");

// REG-007 — Mobile active job controls cannot be buried behind bottom nav.
const jobAction = "src/components/appointments/JobActionButton.tsx";
requireText(jobAction, "max-md:fixed", "mobile job action visibility");
requireText(jobAction, "var(--mobile-nav-height)", "mobile job action bottom-nav clearance");

// REG-008 — Appointment list/card totals must use stamped appointment pricing,
// not re-synthesize tax from current business defaults.
const appointmentTotal = "src/lib/appointmentTotal.ts";
requireText(appointmentTotal, "only use tax that is already attached to the appointment", "appointment stamped pricing authority");
requireText(appointmentTotal, "computeFinancialSummary", "appointment canonical financial summary");

// REG-009 — Create and reschedule must share one availability policy.
const appointmentCollection = "app/api/v1/appointments/route.ts";
const appointmentMember = "app/api/v1/appointments/[id]/route.ts";
for (const [label, file] of [["create", appointmentCollection], ["reschedule", appointmentMember]]) {
  requireText(file, "validateLocalAvailability", `appointment ${label} availability policy`);
  requireText(file, "workspace_blackout_dates", `appointment ${label} blackout protection`);
  requireText(file, "conflictWindow", `appointment ${label} buffer conflict protection`);
}

// REG-010 — Browser data access remains server-owned. This gate must exist and
// remain part of prebuild; otherwise direct Supabase data calls can creep back.
requireFile("scripts/check-architecture-contract.mjs", "server-owned data boundary");

// REG-011 — Identity/RBAC must fail closed and stay independently certified.
requireFile("scripts/check-identity-contract.mjs", "identity/RBAC regression certification");
requireFile("src/domain/auth/__tests__/route-authorization.test.ts", "route authorization regression tests");

// REG-012 — New-business onboarding stays retired and routes to Settings setup.
requireText("src/legacy-pages/Onboarding.tsx", '/settings?tab=business&setup=1', "retired onboarding redirect");
requireFile("scripts/certify-onboarding-contract.mjs", "onboarding regression certification");

// REG-013 — Email settings remain server-backed instead of browser-owned.
requireText("src/application/queries/email-settings.query.ts", '/v1/email-settings', "email settings server query");
requireText("src/application/commands/email-settings.command.ts", '/v1/email-settings', "email settings server command");

// REG-014 — Canonical mutable resources retain CRUD and workspace scoping.
requireFile("scripts/certify-crud-contract.mjs", "CRUD/workspace regression certification");

// REG-015 — Critical-path E2E files may not contain unconditional placeholder
// skips. Environment-gated skips are allowed for authenticated fixtures, but a
// file whose actual workflow tests are all test.skip() is not coverage.
const e2eDir = path.join(root, "e2e", "tests");
if (!fs.existsSync(e2eDir)) {
  failures.push("critical E2E suite missing e2e/tests");
} else {
  const specs = fs.readdirSync(e2eDir).filter((name) => name.endsWith(".spec.ts"));
  if (specs.length < 3) failures.push(`critical E2E suite unexpectedly small: ${specs.length} spec files`);
  for (const spec of specs) {
    const source = read(path.join("e2e", "tests", spec));
    const realTests = (source.match(/\btest\s*\(/g) || []).length;
    const unconditionalSkips = (source.match(/\btest\.skip\s*\(\s*\)/g) || []).length;
    if (realTests > 0 && unconditionalSkips >= realTests) {
      failures.push(`critical E2E placeholder detected: e2e/tests/${spec} has no executing workflow test`);
    }
  }
}

// REG-016 — Responsive coverage is a release invariant, not a one-off manual
// check. Every Playwright spec runs through desktop, tablet, and phone projects.
const pwConfig = "e2e/playwright.config.ts";
for (const project of ["desktop-chromium", "tablet-chromium", "mobile-chromium"]) {
  requireText(pwConfig, `name: "${project}"`, `Playwright ${project} coverage`);
}

// The regression lock itself must be wired into prebuild so Vercel/main cannot
// produce a release artifact after one of these invariants disappears.
requireText("package.json", "scripts/certify-regression-lock.mjs", "regression lock prebuild wiring");

if (failures.length) {
  console.error("regression-lock: FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("regression-lock: PASS — known production failure modes remain pinned and responsive/E2E coverage is present.");
