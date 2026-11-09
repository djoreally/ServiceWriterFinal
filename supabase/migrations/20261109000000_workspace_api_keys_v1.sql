-- Workspace API keys + agent-access audit trail (Agent API / MCP build)
--
-- Service Writer is a generic platform: any workspace can issue API keys to
-- let an external system or agent work that workspace under a scoped,
-- revocable credential. This migration is ADDITIVE ONLY:
--   * two new tables (workspace_api_keys, workspace_api_key_usage)
--   * no changes to existing tables, policies, or functions
--
-- Security model:
--   * Only the SHA-256 hash of a key is stored. The raw key is shown once,
--     at creation time, to the workspace admin who created it.
--   * Keys are bound to exactly one workspace. The workspace for every
--     agent request comes from the key record, never from caller input.
--   * Key management (list/create/revoke) is restricted to workspace
--     admins via RLS (is_workspace_admin) AND via the staff-session API.
--   * The agent runtime authenticates with the service-role client on the
--     server only, after a constant-time hash match; RLS stays enabled so
--     no anon/authenticated role can read key material directly.
--
-- STATUS: migration file only — NOT APPLIED to production by this change.

create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- Who/what the key was issued to (e.g. an integrator or agent name).
  -- Stamped onto every action the key takes for attribution.
  integrator text not null check (char_length(integrator) between 1 and 120),
  -- Non-secret display/lookup prefix, e.g. "sw_live_ab12cd34".
  key_prefix text not null,
  -- SHA-256 hex of the full key. Unique: one hash maps to at most one key.
  key_hash text not null unique,
  -- Granted scopes, e.g. {catalog:read, availability:read, bookings:create}.
  scopes text[] not null default '{}',
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists workspace_api_keys_workspace_idx
  on public.workspace_api_keys (workspace_id, created_at desc);

create index if not exists workspace_api_keys_prefix_idx
  on public.workspace_api_keys (key_prefix);

create table if not exists public.workspace_api_key_usage (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.workspace_api_keys(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integrator text not null,
  -- e.g. "booking.create", "customer.create", "mcp.tools/call".
  action text not null,
  resource_type text,
  resource_id text,
  created_at timestamptz not null default now()
);

create index if not exists workspace_api_key_usage_key_idx
  on public.workspace_api_key_usage (api_key_id, created_at desc);

create index if not exists workspace_api_key_usage_workspace_idx
  on public.workspace_api_key_usage (workspace_id, created_at desc);

alter table public.workspace_api_keys enable row level security;
alter table public.workspace_api_key_usage enable row level security;

-- Key records are visible to workspace admins only (hashes, never raw keys).
drop policy if exists workspace_api_keys_select_admin on public.workspace_api_keys;
create policy workspace_api_keys_select_admin
  on public.workspace_api_keys
  for select
  to authenticated
  using (public.is_workspace_admin(workspace_id));

drop policy if exists workspace_api_keys_insert_admin on public.workspace_api_keys;
create policy workspace_api_keys_insert_admin
  on public.workspace_api_keys
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));

-- Revocation and metadata edits are admin-only updates.
drop policy if exists workspace_api_keys_update_admin on public.workspace_api_keys;
create policy workspace_api_keys_update_admin
  on public.workspace_api_keys
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- The usage trail is admin-readable; rows are written by the server
-- (service role) only, so there is deliberately no insert policy.
drop policy if exists workspace_api_key_usage_select_admin on public.workspace_api_key_usage;
create policy workspace_api_key_usage_select_admin
  on public.workspace_api_key_usage
  for select
  to authenticated
  using (public.is_workspace_admin(workspace_id));
