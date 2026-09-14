import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

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

const proxyPath = "app/api/v1/supabase-proxy/route.ts";
if (!exists(proxyPath)) failures.push(`Missing canonical Supabase server proxy: ${proxyPath}`);

const clientPath = "src/integrations/supabase/client.ts";
const client = read(clientPath);
if (!client.includes("isOperationalSupabaseRequest")) {
  failures.push(`${clientPath}: operational Supabase request classifier is missing.`);
}
if (!client.includes('"/api/v1/supabase-proxy?path="')) {
  failures.push(`${clientPath}: operational browser traffic is not pinned to the same-origin Next API proxy.`);
}

for (const file of walk("src")) {
  if (file === "src/integrations/supabase/client.ts") continue;
  const content = read(file);

  if (/https:\/\/[^"'\s]+\.supabase\.co\/(?:rest|functions|storage)\/v1\//.test(content)) {
    // mcpConnection publishes an external MCP endpoint for third-party clients;
    // it is metadata, not an in-app browser data transport.
    if (file !== "src/lib/mcpConnection.ts") {
      failures.push(`${file}: literal browser-operational Supabase endpoint is forbidden.`);
    }
  }

  const referencesResolvedSupabaseUrl =
    /SUPABASE_(?:URL|PROJECT_ID)_RESOLVED/.test(content) ||
    /SERVICE_WRITER_BACKEND_PROJECT_ID/.test(content);
  if (referencesResolvedSupabaseUrl && /\bfetch\s*\(/.test(content)) {
    failures.push(`${file}: raw fetch may not construct operational Supabase traffic from resolved project configuration; use operationalSupabaseProxyUrl() or a typed /api/v1 route.`);
  }

  if (/\bfetch\s*\(\s*[^\n]*MCP_SERVER_URL/.test(content)) {
    failures.push(`${file}: browser fetch to the external MCP Supabase URL is forbidden; use the Next API proxy for in-app probes.`);
  }
}

if (failures.length) {
  console.error("Server data-boundary verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Server data-boundary passed: browser operational Supabase HTTP is forced through app/api/**.");
