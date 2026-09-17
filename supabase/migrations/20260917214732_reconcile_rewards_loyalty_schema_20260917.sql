-- Canonical Rewards & Loyalty schema.
-- crm_loyalty_accounts + crm_loyalty_ledger remain the balance/ledger source of truth.

create table if not exists public.crm_loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  scope text not null default 'per_customer' check (scope in ('per_customer','per_vehicle','global')),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  points_per_dollar numeric(12,4) not null default 0 check (points_per_dollar >= 0),
  points_per_visit integer not null default 0 check (points_per_visit >= 0),
  is_default boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_loyalty_programs_one_default_active_idx
  on public.crm_loyalty_programs(workspace_id)
  where status='active' and is_default;

create table if not exists public.crm_loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  program_id uuid not null references public.crm_loyalty_programs(id) on delete cascade,
  name text not null,
  description text null,
  points_required integer not null check (points_required > 0),
  reward_type text not null check (reward_type in ('credit','free_service','discount_percent','discount_fixed','priority_booking')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_loyalty_rewards_program_idx
  on public.crm_loyalty_rewards(program_id,status,points_required);

alter table public.crm_loyalty_accounts
  add column if not exists program_id uuid null references public.crm_loyalty_programs(id) on delete set null;

create table if not exists public.crm_loyalty_reward_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  loyalty_account_id uuid not null references public.crm_loyalty_accounts(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.crm_loyalty_rewards(id) on delete restrict,
  points_cost integer not null check (points_cost > 0),
  status text not null default 'available' check (status in ('available','reserved','redeemed','cancelled','expired')),
  reserved_appointment_id uuid null references public.appointments(id) on delete set null,
  reserved_until timestamptz null,
  applied_discount_cents integer null check (applied_discount_cents is null or applied_discount_cents >= 0),
  expires_at timestamptz null,
  redeemed_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_loyalty_reward_instances_account_idx
  on public.crm_loyalty_reward_instances(loyalty_account_id,status,created_at desc);
create unique index if not exists crm_loyalty_reward_instances_one_live_reward_idx
  on public.crm_loyalty_reward_instances(loyalty_account_id,reward_id)
  where status in ('available','reserved');
create unique index if not exists crm_loyalty_ledger_source_once_idx
  on public.crm_loyalty_ledger(workspace_id,source_type,source_id)
  where source_id is not null;

alter table public.crm_loyalty_programs enable row level security;
alter table public.crm_loyalty_rewards enable row level security;
alter table public.crm_loyalty_reward_instances enable row level security;

drop policy if exists crm_loyalty_programs_select on public.crm_loyalty_programs;
create policy crm_loyalty_programs_select on public.crm_loyalty_programs for select to authenticated
using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_programs_write on public.crm_loyalty_programs;
create policy crm_loyalty_programs_write on public.crm_loyalty_programs for all to authenticated
using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_rewards_select on public.crm_loyalty_rewards;
create policy crm_loyalty_rewards_select on public.crm_loyalty_rewards for select to authenticated
using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_rewards_write on public.crm_loyalty_rewards;
create policy crm_loyalty_rewards_write on public.crm_loyalty_rewards for all to authenticated
using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_reward_instances_select on public.crm_loyalty_reward_instances;
create policy crm_loyalty_reward_instances_select on public.crm_loyalty_reward_instances for select to authenticated
using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_reward_instances_write on public.crm_loyalty_reward_instances;
create policy crm_loyalty_reward_instances_write on public.crm_loyalty_reward_instances for all to authenticated
using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));
