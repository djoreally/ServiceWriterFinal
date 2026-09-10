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

if (!shell.includes('defaultTheme="system"')) fail("new users must default to system theme");
if (!theme.includes("${storageKey}:${userId}")) fail("theme storage must be scoped to the authenticated user");
if (settings.includes("<TabsList") || settings.includes("<TabsTrigger")) fail("Settings must use one category navigation surface, not a duplicate tab strip");
if ((bottomNav.match(/path: "\/settings"/g) || []).length > 0) fail("mobile bottom navigation must not duplicate Settings");
if (!table.includes("tabular-nums")) fail("canonical tables must use tabular numerals");

const operationalGradientFiles = [
  "src/components/retention/RetentionHeroStrip.tsx",
  "src/components/workflow/TimeClock.tsx",
];
for (const file of operationalGradientFiles) {
  if (fs.existsSync(path.join(root, file)) && read(file).includes("bg-gradient")) {
    console.warn(`frontend-ui-contract: legacy operational gradient remains in ${file}; migrate when that surface is touched`);
  }
}

if (!process.exitCode) console.log("frontend-ui-contract: PASS");
