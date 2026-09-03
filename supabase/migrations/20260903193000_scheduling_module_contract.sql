-- Canonical workspace-scoped scheduling module.
-- Replaces retired user_id/business_profiles availability contracts.

create table if not exists public.workspace_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  blocked_date date not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, blocked_date)
);

create table if not exists public.workspace_intake_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  question_text text not null check (char_length(trim(question_text)) > 0),
  question_type text not null check (question_type in ('text','textarea','select','checkbox')),
  options jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_blackout_dates_workspace_date_idx
  on public.workspace_blackout_dates(workspace_id, blocked_date);
create index if not exists workspace_intake_questions_workspace_sort_idx
  on public.workspace_intake_questions(workspace_id, sort_order, created_at);

alter table public.workspace_blackout_dates enable row level security;
alter table public.workspace_intake_questions enable row level security;

drop policy if exists workspace_blackout_dates_member_read on public.workspace_blackout_dates;
create policy workspace_blackout_dates_member_read on public.workspace_blackout_dates
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_intake_questions_member_read on public.workspace_intake_questions;
create policy workspace_intake_questions_member_read on public.workspace_intake_questions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_blackout_dates_scheduler_write on public.workspace_blackout_dates;
create policy workspace_blackout_dates_scheduler_write on public.workspace_blackout_dates
  for all to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_blackout_dates.workspace_id
      and wm.user_id = auth.uid() and wm.is_active
      and wm.role in ('owner','admin','manager','service_advisor','dispatcher','receptionist')
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_blackout_dates.workspace_id
      and wm.user_id = auth.uid() and wm.is_active
      and wm.role in ('owner','admin','manager','service_advisor','dispatcher','receptionist')
  ));

drop policy if exists workspace_intake_questions_scheduler_write on public.workspace_intake_questions;
create policy workspace_intake_questions_scheduler_write on public.workspace_intake_questions
  for all to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_intake_questions.workspace_id
      and wm.user_id = auth.uid() and wm.is_active
      and wm.role in ('owner','admin','manager','service_advisor','dispatcher','receptionist')
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_intake_questions.workspace_id
      and wm.user_id = auth.uid() and wm.is_active
      and wm.role in ('owner','admin','manager','service_advisor','dispatcher','receptionist')
  ));

revoke all on public.workspace_blackout_dates from anon;
revoke all on public.workspace_intake_questions from anon;
grant select, insert, update, delete on public.workspace_blackout_dates to authenticated;
grant select, insert, update, delete on public.workspace_intake_questions to authenticated;
grant all on public.workspace_blackout_dates to service_role;
grant all on public.workspace_intake_questions to service_role;

create or replace function public.get_public_blocked_dates(
  p_business_user_id uuid,
  p_customer_account_id uuid default null
)
returns table(blocked_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_date, b.reason
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  join public.workspace_blackout_dates b on b.workspace_id = w.id
  where w.created_by = p_business_user_id
    and w.is_active
    and ws.booking_enabled
  order by b.blocked_date;
$$;

revoke all on function public.get_public_blocked_dates(uuid, uuid) from public;
grant execute on function public.get_public_blocked_dates(uuid, uuid) to anon, authenticated, service_role;
