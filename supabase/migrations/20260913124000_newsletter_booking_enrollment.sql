-- MOMS-style newsletter enrollment and weekly delivery state.
alter table public.newsletter_subscribers
  add column if not exists source text not null default 'manual',
  add column if not exists booking_slug text,
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists consented_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists welcome_message_id text,
  add column if not exists next_issue_number integer not null default 1,
  add column if not exists next_send_at timestamptz;

create unique index if not exists newsletter_subscribers_unsubscribe_token_uidx
  on public.newsletter_subscribers (unsubscribe_token);

create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  template_id uuid references public.newsletter_templates(id) on delete set null,
  issue_number integer not null check (issue_number between 1 and 52),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','accepted','sent','delivered','failed','suppressed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscriber_id, issue_number)
);

create index if not exists newsletter_subscribers_due_idx
  on public.newsletter_subscribers (next_send_at)
  where status = 'active' and next_send_at is not null;

create index if not exists newsletter_deliveries_workspace_idx
  on public.newsletter_deliveries (workspace_id, created_at desc);

alter table public.newsletter_deliveries enable row level security;

drop policy if exists newsletter_deliveries_member_select on public.newsletter_deliveries;
create policy newsletter_deliveries_member_select
  on public.newsletter_deliveries for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists newsletter_deliveries_admin_write on public.newsletter_deliveries;
create policy newsletter_deliveries_admin_write
  on public.newsletter_deliveries for all to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
