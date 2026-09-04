import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [
  "src/server/api.ts",
  "app/api/v1/identity/route.ts",
  "docs/identity-auth-rbac-baseline.md",
]) assert(exists(file), `Missing identity contract surface: ${file}`);

const api = read("src/server/api.ts");
assert(api.includes("supabase.auth.getUser()"), "Server authentication must validate the user with Supabase Auth getUser().");
assert(!/user_metadata|raw_user_meta_data/.test(api), "Authorization may not depend on user-editable metadata.");
assert(/\.from\(["']workspace_members["']\)/.test(api), "Workspace authorization must resolve through workspace_members.");
assert(/\.eq\(["']user_id["'],\s*user\.id\)/.test(api), "Workspace authorization must bind membership to the authenticated user.");
assert(/\.eq\(["']is_active["'],\s*true\)/.test(api), "Workspace authorization must require active membership.");

const identity = read("app/api/v1/identity/route.ts");
assert(identity.includes("requireUser(request)"), "Identity endpoint must require an authenticated user.");
assert(identity.includes('.from("workspace_members")'), "Identity endpoint must expose staff memberships from workspace_members.");
assert(identity.includes('.from("customer_users")'), "Identity endpoint must keep customer identity separate through customer_users.");
assert(identity.includes('.eq("user_id", user.id)'), "Identity endpoint must scope identity records to the authenticated user.");

const baseline = read("docs/identity-auth-rbac-baseline.md");
for (const required of [
  "workspace_members",
  "customer_users",
  "accept_invitation_v1",
  "is_workspace_member",
  "is_workspace_admin",
  "is_workspace_staff",
  "RLS",
]) assert(baseline.includes(required), `Identity baseline is missing required authority: ${required}`);

if (failures.length) {
  console.error("Identity/RBAC contract verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Identity/RBAC contract passed: Supabase Auth, active workspace membership, separated customer identity, and documented RLS authority are consistent.");
