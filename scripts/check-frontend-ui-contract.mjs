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
const responsiveRecord = read("src/components/data-table/ResponsiveRecord.tsx");
const appointmentsPage = read("src/legacy-pages/Appointments.tsx");
const appointmentsQuery = read("src/application/queries/appointments.query.ts");

if (!shell.includes('defaultTheme="system"')) fail("new users must default to system theme");
if (!theme.includes("${storageKey}:${userId}")) fail("theme storage must be scoped to the authenticated user");
if (settings.includes("<TabsList") || settings.includes("<TabsTrigger")) fail("Settings must use one category navigation surface, not a duplicate tab strip");
if ((bottomNav.match(/path: "\/settings"/g) || []).length > 0) fail("mobile bottom navigation must not duplicate Settings");
if (!table.includes("tabular-nums")) fail("canonical tables must use tabular numerals");
if (!table.includes("[container-type:inline-size]")) fail("canonical tables must own responsive breakpoints via container queries");
if (!table.includes("More details")) fail("canonical tables must preserve collapsed mobile fields behind in-place reveal");
if (!responsiveRecord.includes("ResponsiveRecord")) fail("responsive record primitive is required for ranked mobile data layouts");
if (!responsiveRecord.includes("[container-type:inline-size]")) fail("responsive records must own their breakpoint");
if (!appointmentsPage.includes("fetchAppointmentsListData")) fail("appointments must render list data before form reference hydration");
if (!appointmentsPage.includes("fetchAppointmentFormReferenceData")) fail("appointment form references must hydrate independently");
if (!appointmentsQuery.includes("fetchAppointmentsListData")) fail("appointment list fast-path query is required");
if (dashboard.includes("lucide-react")) fail("dashboard must not use decorative iconography");
if (/icon:\s*[A-Z]/.test(navItems)) fail("application navigation must not carry decorative icon metadata");

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

if (!process.exitCode) console.log("frontend-ui-contract: PASS");
