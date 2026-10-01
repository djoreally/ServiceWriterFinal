import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://rjfbrfognxqkyhdrpibx.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const email = "servicewriter-demo@servicewriter.xyz";
const password = `SWDemo!${crypto.randomBytes(12).toString("base64url")}#26`;
const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user = null;
for (let page = 1; page <= 10 && !user; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (data.users.length < 100) break;
}

if (user) {
  const { data, error } = await client.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: "Service Writer CRUD Demo" },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Service Writer CRUD Demo" },
  });
  if (error) throw error;
  user = data.user;
}

if (!user?.id) throw new Error("Demo auth user was not created");

const slug = "service-writer-crud-demo";
let { data: workspace, error: workspaceLookupError } = await client
  .from("workspaces")
  .select("id,name,slug")
  .eq("slug", slug)
  .maybeSingle();
if (workspaceLookupError) throw workspaceLookupError;

if (!workspace) {
  const { data, error } = await client
    .from("workspaces")
    .insert({
      name: "Service Writer CRUD Demo",
      slug,
      kind: "shop",
      app_role: "user",
      legal_name: "Service Writer CRUD Demo",
      timezone: "America/New_York",
      currency_code: "USD",
      is_active: true,
      created_by: user.id,
    })
    .select("id,name,slug")
    .single();
  if (error) throw error;
  workspace = data;
}

const { error: membershipError } = await client
  .from("workspace_members")
  .upsert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
    is_active: true,
  }, { onConflict: "workspace_id,user_id" });
if (membershipError) throw membershipError;

const credentials = {
  email,
  password,
  workspaceId: workspace.id,
  workspaceSlug: workspace.slug,
  role: "owner",
  createdAt: new Date().toISOString(),
};
fs.writeFileSync("demo-account.json", JSON.stringify(credentials, null, 2));
console.log(`::add-mask::${password}`);
console.log(`Provisioned ${email} in isolated workspace ${workspace.slug}`);
