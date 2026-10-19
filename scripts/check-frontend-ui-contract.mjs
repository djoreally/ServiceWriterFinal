import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => { console.error(`frontend-ui-contract: ${message}`); process.exitCode = 1; };

const shell = read("src/NextClientShell.tsx");
const theme = read("src/components/ThemeProvider.tsx");
const settings = read("src/legacy-pages/Settings.tsx");
const bottomNav = read("src/components/layout/BottomNavBar.tsx");
const table = read("src/components/ui/table.tsx");
const dashboard = read("src/components/dashboard/DashboardCockpit.tsx");
const navItems = read("src/components/layout/navItems.ts");
const tenantBooking = read("src/legacy-pages/TenantBooking.tsx");

if (!shell.includes('defaultTheme="system"')) fail("new users must default to system theme");
if (!theme.includes("${storageKey}:${userId}")) fail("theme storage must be scoped to the authenticated user");
if (settings.includes("<TabsList") || settings.includes("<TabsTrigger")) fail("Settings must use one category navigation surface, not a duplicate tab strip");
if ((bottomNav.match(/path: "\/settings"/g) || []).length > 0) fail("mobile bottom navigation must not duplicate Settings");
if (!table.includes("tabular-nums")) fail("canonical tables must use tabular numerals");
if (dashboard.includes("lucide-react")) fail("dashboard must not use decorative iconography");
if (/icon:\s*[A-Z]/.test(navItems)) fail("application navigation must not carry decorative icon metadata");

// Embedded booking is consumed by external host pages, so it must publish its
// current document height without leaking booking/customer payloads.
if (!tenantBooking.includes('location.pathname !== "/embed/booking"')) fail("booking auto-resize must stay isolated to /embed/booking");
if (!tenantBooking.includes('servicewriter:booking-resize')) fail("embedded booking must expose the stable resize message type");
if (!tenantBooking.includes("new ResizeObserver(reportHeight)")) fail("embedded booking must react to layout-size changes");
if (!tenantBooking.includes("new MutationObserver(reportHeight)")) fail("embedded booking must react to step/content changes");
if (!tenantBooking.includes("window.parent.postMessage({ type: BOOKING_RESIZE_MESSAGE, height }")) fail("embedded booking resize message must contain only type + height");

const operationalGradientFiles = [
  "src/components/retention/RetentionHeroStrip.tsx",
  "src/components/workflow/TimeClock.tsx",
  "src/components/dashboard/DashboardCockpit.tsx",
  "src/legacy-pages/financials/Expenses.tsx",
  "src/components/fleet/vehicle-import/VehicleImportLanding.tsx",
  "src/components/customer/UpcomingAppointmentWidget.tsx",
  "src/legacy-pages/VehicleSpecs.tsx",
  "src/legacy-pages/Subscriptions.tsx",
  "src/components/booking/VehicleEntry.tsx",
  "src/components/marketing/TestimonialManager.tsx",
];
for (const file of operationalGradientFiles) {
  if (fs.existsSync(path.join(root, file)) && read(file).includes("bg-gradient")) {
    fail(`decorative operational gradient detected in ${file}`);
  }
}

/* ---------------------------------------------------------------------------
 * Contract v2 (2026-10-19): geometry, fonts, charts, attention numerals.
 * ------------------------------------------------------------------------- */

const indexCss = read("src/index.css");
const radiusCss = read("src/components/ui/radius.css");
const tailwindConfig = read("tailwind.config.ts");
const rootLayout = read("app/layout.tsx");

// Rule 16 — fonts are self-hosted; no render-blocking external font requests.
if (indexCss.includes("fonts.googleapis.com") || indexCss.includes("fonts.gstatic.com")) {
  fail("fonts must be self-hosted (no external font stylesheet imports in index.css)");
}
if (!rootLayout.includes("@fontsource-variable/inter")) {
  fail("app/layout.tsx must import the self-hosted Inter variable font package");
}

// Rule 13 — one radius scale, owned by radius.css, mapped by tailwind.config.ts.
for (const token of ["--radius-sm:", "--radius-md:", "--radius-lg:", "--radius-xl:"]) {
  if (indexCss.includes(token)) fail(`duplicate radius token ${token} in index.css — the scale is owned by components/ui/radius.css`);
}
for (const [token, value] of [["--radius-sm:", "4px"], ["--radius-md:", "8px"], ["--radius-lg:", "16px"]]) {
  if (!radiusCss.includes(`${token} ${value}`)) fail(`canonical radius scale must define ${token} ${value}`);
}
if (!tailwindConfig.includes('lg: "var(--radius-lg)"')) fail("tailwind rounded-lg must map to var(--radius-lg)");

// Rule 14 — attention numerals are tokenized and AA-contrast; charts are tokenized.
const definedInBothThemes = (token) => indexCss.split(token).length - 1 >= 2;
if (!definedInBothThemes("--attention-fg:")) fail("--attention-fg must be defined for both light and dark themes");
if (!tailwindConfig.includes("hsl(var(--attention-fg))")) fail("tailwind must expose the attention foreground token");
if (dashboard.includes("text-amber-500")) fail("KPI attention values must use text-attention-fg (AA contrast), not raw amber");
for (const token of ["--chart-1:", "--chart-trend-up:", "--chart-trend-down:"]) {
  if (!definedInBothThemes(token)) fail(`chart token ${token} must be defined for both light and dark themes`);
}

/* ---------------------------------------------------------------------------
 * Ratchet — legacy token-bypass counts may only go down.
 * Update deliberately: node scripts/check-frontend-ui-contract.mjs --update
 * ------------------------------------------------------------------------- */

const RATCHET_PATH = path.join(root, "scripts/frontend-ui-ratchet-baseline.json");

function walkTsx(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkTsx(full));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

/**
 * Inline style is ONLY a violation when it hardcodes static styling (the
 * design-token bypass the ratchet exists to stop). Runtime-dynamic values —
 * prop-driven sizes, computed templates, token references, spreads — are the
 * legitimate use of the style prop and are not counted.
 */
const DYNAMIC_STYLE_SIGNALS = ["${", "var(", "calc(", "...", "hsl(", "??", "?", " as "];
const isDynamicStyleBody = (body) => {
  if (DYNAMIC_STYLE_SIGNALS.some((signal) => body.includes(signal))) return true;
  if (/^\s*[A-Za-z_$][\w$]*\s*$/.test(body)) return true; // shorthand: { height }
  if (/[A-Za-z_$][\w$]*(\.|\()/.test(body)) return true;  // member access or call: foo.bar / fn(
  if (/:\s*[A-Za-z_$][\w$]*\s*[,}]/.test(body)) return true; // value from identifier: { height: bar }
  return false;
};

function countMetrics() {
  const files = walkTsx(path.join(root, "src"));
  const metrics = {
    directLightDarkClasses: 0,
    inlineStyles: 0,
    arbitraryValueClasses: 0,
    gradientFiles: 0,
    pastedHexColors: 0,
  };
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    metrics.directLightDarkClasses += (content.match(/\b(?:text|bg)-(?:white|black)\b/g) || []).length;
    const styleBodies = content.match(/style=\{\{([\s\S]*?)\}\}/g) || [];
    metrics.inlineStyles += styleBodies.filter((block) => !isDynamicStyleBody(block)).length;
    metrics.arbitraryValueClasses += (content.match(/[a-z:-]+-\[[^\]]+\]/g) || []).length;
    metrics.pastedHexColors += (content.match(/#[0-9a-fA-F]{6}\b/g) || []).length;
    if (content.includes("bg-gradient")) metrics.gradientFiles += 1;
  }
  return metrics;
}

const currentMetrics = countMetrics();

if (process.argv.includes("--update")) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = fs.existsSync(RATCHET_PATH) ? JSON.parse(fs.readFileSync(RATCHET_PATH, "utf8")) : {};
  fs.writeFileSync(RATCHET_PATH, JSON.stringify({
    recordedAt: today,
    phase: existing.phase || "refactor program",
    meaning: existing.meaning || "Legacy design-token bypass counts across src/**/*.tsx. Counts may only stay flat or go down.",
    metrics: currentMetrics,
  }, null, 2) + "\n");
  console.log(`frontend-ui-contract: ratchet baseline updated ${JSON.stringify(currentMetrics)}`);
} else {
  const baseline = JSON.parse(fs.readFileSync(RATCHET_PATH, "utf8")).metrics;
  for (const key of Object.keys(baseline)) {
    const current = currentMetrics[key] ?? 0;
    const allowed = baseline[key];
    if (current > allowed) {
      fail(`ratchet exceeded for ${key}: ${current} > ${allowed} — token bypasses may only shrink (see docs/FRONTEND_UI_CONTRACT.md)`);
    } else if (current < allowed) {
      console.log(`frontend-ui-contract: ${key} improved ${allowed} → ${current} (re-record with --update at phase end)`);
    }
  }
}

if (!process.exitCode) console.log("frontend-ui-contract: PASS");
