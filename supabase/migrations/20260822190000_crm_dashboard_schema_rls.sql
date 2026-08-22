-- CRM dashboard foundation: schema, capabilities, indexes, and RLS.
-- This migration is intentionally limited to CRM tables and authorization helpers.

begin;

create table if not exists public.crm_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in (
    'crm.view','crm.profile.write','crm.lead.write','crm.task.write',
    'crm.segment.manage','crm.campaign.draft','crm.campaign.approve',
    'crm.campaign.send','crm.loyalty.adjust','crm.export','crm.settings.manage'
  )),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, capability)
);

create table if not exists public.crm_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  lifecycle_stage text not null default 'new' check (lifecycle_stage in ('new','contacted','qualified','booked','active','due','at_risk','reactivated','inactive')),
  lead_source text,
  relationship_owner_id uuid references auth.users(id) on delete set null,
  next_action_at timestamptz,
  preferred_channel text check (preferred_channel is null or preferred_channel in ('email','sms','phone','none')),
  last_contacted_at timestamptz,
  last_service_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, customer_id)
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  activity_type text not null check (activity_type in ('call','note','follow_up','campaign_interaction','review','referral','service_milestone')),
  summary text not null check (char_length(summary) between 1 and 4000),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  source_event_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, source_event_id)
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  name text not null check (char_length(name) between 1 and 240),
  email text,
  phone text,
  source text,
  status text not null default 'new' check (status in ('new','contacted','qualified','lost','converted')),
  notes text,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  description text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  definition jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  purpose text not null check (purpose in ('marketing','loyalty','newsletter','win_back','review_request','referral','education')),
  channel text not null check (channel in ('email','sms')),
  template_id uuid,
  segment_id uuid references public.crm_segments(id) on delete set null,
  approval_state text not null default 'draft' check (approval_state in ('draft','pending_approval','approved','scheduled','sending','paused','completed','cancelled')),
  frequency_policy jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_campaign_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.crm_campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  destination text not null,
  eligibility_state text not null default 'eligible' check (eligibility_state in ('eligible','ineligible','suppressed','invalid')),
  suppression_reason text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','queued','sent','delivered','failed','cancelled')),
  message_intent_id uuid,
  created_at timestamptz not null default now(),
  unique (campaign_id, customer_id, destination)
);

create table if not exists public.crm_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  current_points integer not null default 0 check (current_points >= 0),
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, customer_id)
);

create table if not exists public.crm_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  loyalty_account_id uuid not null references public.crm_loyalty_accounts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  points_delta integer not null check (points_delta <> 0),
  reason text not null check (char_length(reason) between 1 and 240),
  source_type text not null,
  source_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, source_type, source_id)
);

create table if not exists public.crm_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_profiles_workspace_stage_idx on public.crm_profiles(workspace_id, lifecycle_stage);
create index if not exists crm_profiles_workspace_next_action_idx on public.crm_profiles(workspace_id, next_action_at);
create index if not exists crm_activities_workspace_customer_idx on public.crm_activities(workspace_id, customer_id, occurred_at desc);
create index if not exists crm_leads_workspace_status_idx on public.crm_leads(workspace_id, status);
create index if not exists crm_tasks_workspace_due_idx on public.crm_tasks(workspace_id, status, due_at);
create index if not exists crm_campaigns_workspace_state_idx on public.crm_campaigns(workspace_id, approval_state, scheduled_at);
create index if not exists crm_campaign_members_workspace_status_idx on public.crm_campaign_members(workspace_id, delivery_status);
create index if not exists crm_audit_events_workspace_created_idx on public.crm_audit_events(workspace_id, created_at desc);

create or replace function public.has_crm_capability(target_workspace_id uuid, required_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role::text in ('owner','admin','manager')
  )
  or exists (
    select 1 from public.crm_permissions cp
    where cp.workspace_id = target_workspace_id
      and cp.user_id = auth.uid()
      and cp.capability = required_capability
  );
$$;

revoke all on function public.has_crm_capability(uuid, text) from public, anon;
grant execute on function public.has_crm_capability(uuid, text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['crm_permissions','crm_profiles','crm_activities','crm_leads','crm_tasks','crm_segments','crm_campaigns','crm_campaign_members','crm_loyalty_accounts','crm_loyalty_ledger','crm_audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
  revoke delete on table public.crm_audit_events, public.crm_loyalty_ledger from authenticated;
end $$;

-- Capability table is managed only by workspace owners/admins.
drop policy if exists crm_permissions_owner_manage on public.crm_permissions;
create policy crm_permissions_owner_manage on public.crm_permissions for all to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[]))
with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[]));

-- Profiles and operational CRM work are visible to CRM users.
drop policy if exists crm_profiles_select on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_profiles_write on public.crm_profiles;
create policy crm_profiles_write on public.crm_profiles for insert to authenticated with check (public.has_crm_capability(workspace_id, 'crm.profile.write'));
drop policy if exists crm_profiles_update on public.crm_profiles;
create policy crm_profiles_update on public.crm_profiles for update to authenticated using (public.has_crm_capability(workspace_id, 'crm.profile.write')) with check (public.has_crm_capability(workspace_id, 'crm.profile.write'));

-- Generic CRM data policies.
drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select on public.crm_activities for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_activities_insert on public.crm_activities;
create policy crm_activities_insert on public.crm_activities for insert to authenticated with check (public.has_crm_capability(workspace_id, 'crm.task.write'));

drop policy if exists crm_leads_member_select on public.crm_leads;
create policy crm_leads_member_select on public.crm_leads for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_leads_member_write on public.crm_leads;
create policy crm_leads_member_write on public.crm_leads for all to authenticated using (public.has_crm_capability(workspace_id, 'crm.lead.write')) with check (public.has_crm_capability(workspace_id, 'crm.lead.write'));

drop policy if exists crm_tasks_member_select on public.crm_tasks;
create policy crm_tasks_member_select on public.crm_tasks for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_tasks_member_write on public.crm_tasks;
create policy crm_tasks_member_write on public.crm_tasks for all to authenticated using (public.has_crm_capability(workspace_id, 'crm.task.write')) with check (public.has_crm_capability(workspace_id, 'crm.task.write'));

drop policy if exists crm_segments_member_select on public.crm_segments;
create policy crm_segments_member_select on public.crm_segments for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_segments_manage on public.crm_segments;
create policy crm_segments_manage on public.crm_segments for all to authenticated using (public.has_crm_capability(workspace_id, 'crm.segment.manage')) with check (public.has_crm_capability(workspace_id, 'crm.segment.manage'));

drop policy if exists crm_campaigns_member_select on public.crm_campaigns;
create policy crm_campaigns_member_select on public.crm_campaigns for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_campaigns_draft on public.crm_campaigns;
create policy crm_campaigns_draft on public.crm_campaigns for insert to authenticated with check (public.has_crm_capability(workspace_id, 'crm.campaign.draft'));
drop policy if exists crm_campaigns_update on public.crm_campaigns;
create policy crm_campaigns_update on public.crm_campaigns for update to authenticated using (public.has_crm_capability(workspace_id, 'crm.campaign.draft')) with check (public.has_crm_capability(workspace_id, 'crm.campaign.draft'));

drop policy if exists crm_campaign_members_select on public.crm_campaign_members;
create policy crm_campaign_members_select on public.crm_campaign_members for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_campaign_members_write on public.crm_campaign_members;
create policy crm_campaign_members_write on public.crm_campaign_members for all to authenticated using (public.has_crm_capability(workspace_id, 'crm.campaign.send')) with check (public.has_crm_capability(workspace_id, 'crm.campaign.send'));

drop policy if exists crm_loyalty_accounts_select on public.crm_loyalty_accounts;
create policy crm_loyalty_accounts_select on public.crm_loyalty_accounts for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_loyalty_accounts_write on public.crm_loyalty_accounts;
create policy crm_loyalty_accounts_write on public.crm_loyalty_accounts for all to authenticated using (public.has_crm_capability(workspace_id, 'crm.loyalty.adjust')) with check (public.has_crm_capability(workspace_id, 'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_ledger_select on public.crm_loyalty_ledger;
create policy crm_loyalty_ledger_select on public.crm_loyalty_ledger for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_loyalty_ledger_insert on public.crm_loyalty_ledger;
create policy crm_loyalty_ledger_insert on public.crm_loyalTY_ledger for insert to authenticated with check (public.has_crm_capability(workspace_id, 'crm.loyalty.adjust'));

drop policy if exists crm_audit_events_select on public.crm_audit_events;
create policy crm_audit_events_select on public.crm_audit_events for select to authenticated using (public.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_audit_events_insert on public.crm_audit_events;
create policy crm_audit_events_insert on public.crm_audit_events for insert to authenticated with check (public.has_crm_capability(workspace_id, 'crm.view'));

commit;
