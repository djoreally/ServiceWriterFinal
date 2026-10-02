-- Shop Agent Phase 1: ZeroLedger audit log + conversation memory.
--
-- Two tables, both workspace-scoped, both service-role-only:
-- RLS is enabled with NO permissive policies for anon/authenticated, so only
-- the service role (server-side agent runtime) can read/write. Append-only by
-- convention: the ledger chain is hash-linked (event_hash covers the previous
-- parent_hash); the application never UPDATEs or DELETEs ledger rows.

create table if not exists public.shop_agent_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id text not null,
  actor text not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  input_hash text not null,
  output_hash text,
  parent_hash text not null,
  event_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_agent_ledger_workspace_event_key'
  ) then
    alter table public.shop_agent_ledger
      add constraint shop_agent_ledger_workspace_event_key unique (workspace_id, event_id);
  end if;
end $$;

create index if not exists shop_agent_ledger_workspace_occurred_idx
  on public.shop_agent_ledger (workspace_id, occurred_at desc);

create table if not exists public.shop_agent_conversations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- sha256 of the normalized caller phone — raw phone is never stored here.
  caller_hash text not null,
  state text not null,
  facts jsonb not null default '{}'::jsonb,
  summary text not null default '',
  turn_count integer not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint shop_agent_conversations_pkey primary key (workspace_id, caller_hash),
  constraint shop_agent_conversations_turn_count_nonnegative check (turn_count >= 0)
);

create index if not exists shop_agent_conversations_expires_idx
  on public.shop_agent_conversations (expires_at);

-- Service-role-only access: enable RLS, create no permissive policies.
-- (Recent repo precedent: tables that only the server touches get RLS with no
-- grants to anon/authenticated.)
alter table public.shop_agent_ledger enable row level security;
alter table public.shop_agent_conversations enable row level security;
