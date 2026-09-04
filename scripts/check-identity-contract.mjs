import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const migration = "supabase/migrations/20260904030727_harden_owner_role_escalation.sql";
for (const file of [
  "src/server/api.ts",
  "app/api/v1/identity/route.ts",
  "app/api/v1/invitations/route.ts",
  "src/integrations/supabase/client.ts",
  "docs/identity-auth-rbac-baseline.md",
  migration,
]) assert(exists(file), `Missing identity contract surface: ${file}`);

const api = read("src/server/api.ts");
assert(api.includes("supabase.auth.getUser()"), "Server authentication must validate the user with Supabase Auth getUser().");
assert(!/user_metadata|raw_user_meta_data/.test(api), "Authorization may not depend on user-editable metadata.");
assert(/\.from\(["']workspace_members["']\)/.test(api), "Workspace authorization must resolve through workspace_members.");
assert(/\.eq\(["']user_id["'],\s*user\.id\)/.test(api), "Workspace authorization must bind membership to the authenticated user.");
assert(/\.eq\(["']is_active["'],\s*true\)/.test(api), "Workspace authorization must require active membership.");

const browserClient = read("src/integrations/supabase/client.ts");
assert(browserClient.includes("CANONICAL_SUPABASE_PROJECT_ID = 'rjfbrfognxqkyhdrpibx'"), "Browser auth must retain the certified production Supabase project fallback.");
assert(browserClient.includes("CANONICAL_SUPABASE_URL"), "Browser auth must retain a canonical production Supabase URL fallback.");
assert(browserClient.includes("CANONICAL_SUPABASE_PUBLISHABLE_KEY"), "Browser auth must retain a canonical active publishable-key fallback.");
assert(!browserClient.includes("http://127.0.0.1:54321"), "Production browser auth may not silently fall back to a disconnected local Supabase endpoint.");
assert(!browserClient.includes("local-development-key"), "Production browser auth may not silently fall back to a dummy API key.");

const identity = read("app/api/v1/identity/route.ts");
assert(identity.includes("requireUser(request)"), "Identity endpoint must require an authenticated user.");
assert(identity.includes('.from("workspace_members")'), "Identity endpoint must expose staff memberships from workspace_members.");
assert(identity.includes('.from("customer_users")'), "Identity endpoint must keep customer identity separate through customer_users.");
assert(identity.includes('.eq("user_id", user.id)'), "Identity endpoint must scope identity records to the authenticated user.");

const invitations = read("app/api/v1/invitations/route.ts");
assert(invitations.includes('body.invited_role === "owner" && membership.role !== "owner"'), "Owner invitations must require an existing workspace owner at the API boundary.");
assert(invitations.includes('owner_role_required'), "Owner invitation escalation must return a stable authorization error code.");

const ownerMigration = read(migration);
assert(ownerMigration.includes("private.is_workspace_owner"), "Database contract must include a private owner-authority helper.");
assert(ownerMigration.includes("public.is_workspace_owner"), "RLS must expose a constrained owner-authority wrapper to authenticated policy evaluation.");
assert(ownerMigration.includes("role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id)"), "Membership RLS must block non-owner assignment or mutation of owner role.");
assert(ownerMigration.includes("invited_role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id)"), "Invitation RLS must block non-owner owner invitations.");

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

console.log("Identity/RBAC contract passed: Supabase Auth, canonical browser backend, active workspace membership, separated customer identity, owner-only owner assignment, and documented RLS authority are consistent.");
