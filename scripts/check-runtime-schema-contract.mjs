import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const RUNTIME_SUFFIXES = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const SKIP_PARTS = ["/__tests__/", "/test/", "/tests/", "/fixtures/", "/generated/"];
const SAME_CHAIN_1400 = "(?:(?!\\.from\\()[\\s\\S]){0,1400}?";
const SAME_CHAIN_900 = "(?:(?!\\.from\\()[\\s\\S]){0,900}?";

const RULES = [
  ["retired table business_profiles", /\.from\(\s*["']business_profiles["']\s*\)/m, "use workspaces/workspace_settings"],
  ["retired table blocked_dates", /\.from\(\s*["']blocked_dates["']\s*\)/m, "use workspace_blackout_dates"],
  ["retired table intake_questions", /\.from\(\s*["']intake_questions["']\s*\)/m, "use workspace_intake_questions"],
  ["retired table client_error_events", /(?:\.from\(\s*["']client_error_events["']\s*\)|\/rest\/v1\/client_error_events)/m, "use server observability/logging"],
  ["retired table customer_accounts", /\.from\(\s*["']customer_accounts["']\s*\)/m, "use customers + customer_users"],
  ["retired customer account RPC", /\.rpc\(\s*["']create_customer_account["']/m, "use link_customer_portal_account_v1"],
  ["retired customer appointments RPC", /\.rpc\(\s*["']get_customer_portal_appointments["']/m, "use get_customer_portal_appointments_v1"],
  ["retired table services", /\.from\(\s*["']services["']\s*\)/m, "use service_catalog"],
  ["retired table appointment_services", /\.from\(\s*["']appointment_services["']\s*\)/m, "use appointment_items"],
  ["retired table fleet_work_orders", /\.from\(\s*["']fleet_work_orders["']\s*\)/m, "use work_orders/fleet_service_requests"],
  ["retired table fleet_vehicles", /\.from\(\s*["']fleet_vehicles["']\s*\)/m, "use vehicles"],
  ["retired table technicians", /\.from\(\s*["']technicians["']\s*\)/m, "use profiles + workspace membership/assignments"],
  ["retired cash collection view", /\.from\(\s*["']cash_collection_receipts_v1["']\s*\)/m, "use canonical payments/invoices APIs"],
  ["retired access edge function", /functions\.invoke\(\s*["']gate-app-access["']/m, "use canonical Supabase session/workspace RBAC"],
  ["legacy appointments.user_id scope", new RegExp(`\\.from\\(\\s*["']appointments["']\\s*\\)${SAME_CHAIN_1400}\\.eq\\(\\s*["']user_id["']`, "m"), "scope appointments by workspace_id"],
  ["legacy appointment title column", new RegExp(`\\.from\\(\\s*["']appointments["']\\s*\\)${SAME_CHAIN_900}\\.select\\([^)]*\\btitle\\b`, "m"), "appointments.title does not exist; derive display text"],
  ["legacy appointment scheduled_date column", new RegExp(`\\.from\\(\\s*["']appointments["']\\s*\\)${SAME_CHAIN_900}\\.select\\([^)]*\\bscheduled_date\\b`, "m"), "use starts_at"],
  ["legacy appointment scheduled_time column", new RegExp(`\\.from\\(\\s*["']appointments["']\\s*\\)${SAME_CHAIN_900}\\.select\\([^)]*\\bscheduled_time\\b`, "m"), "use starts_at"],
];

function normalized(file) {
  return file.split(path.sep).join("/");
}

function isRuntimeFile(file) {
  const value = `/${normalized(file)}`;
  return RUNTIME_SUFFIXES.some((suffix) => file.endsWith(suffix)) && !SKIP_PARTS.some((part) => value.includes(part));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function resolveModule(importer, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
  else if (specifier.startsWith("@packages/")) base = path.join(ROOT, "packages", specifier.slice("@packages/".length));
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = path.resolve(path.dirname(path.join(ROOT, importer)), specifier);
  else return null;

  const candidates = [base];
  for (const extension of RUNTIME_SUFFIXES) candidates.push(`${base}${extension}`);
  for (const extension of RUNTIME_SUFFIXES) candidates.push(path.join(base, `index${extension}`));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const relative = normalized(path.relative(ROOT, candidate));
    return isRuntimeFile(relative) ? relative : null;
  }
  return null;
}

function importSpecifiers(text) {
  const specs = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text))) specs.add(match[1]);
  }
  return [...specs];
}

function shippingGraph() {
  const entries = new Set();
  const appDir = path.join(ROOT, "app");
  for (const full of walk(appDir)) {
    const relative = normalized(path.relative(ROOT, full));
    if (isRuntimeFile(relative)) entries.add(relative);
  }
  for (const candidate of ["src/App.tsx", "proxy.ts"]) {
    if (fs.existsSync(path.join(ROOT, candidate))) entries.add(candidate);
  }

  const reachable = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || reachable.has(file)) continue;
    reachable.add(file);
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const specifier of importSpecifiers(text)) {
      const resolved = resolveModule(file, specifier);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }
  return [...reachable].sort();
}

const files = shippingGraph();
const violations = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const [name, regex, replacement] of RULES) {
    const match = text.match(regex);
    if (!match || match.index == null) continue;
    const line = text.slice(0, match.index).split("\n").length;
    violations.push(`${file}:${line}: ${name}; ${replacement}`);
  }
}

console.log(`runtime-schema-contract: checked ${files.length} import-reachable shipping runtime file(s)`);
if (violations.length === 0) {
  console.log("runtime-schema-contract: PASS");
  process.exit(0);
}

console.error(`runtime-schema-contract: ${violations.length} violation(s) detected:`);
for (const violation of violations) console.error(`- ${violation}`);
console.error("Canonical replacements are documented in scripts/schema-contract.json.");
process.exit(1);
