begin;

create extension if not exists pgcrypto;

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null default gen_random_uuid()::text,
  source_event_id text,
  read boolean not null default false,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.in_app_notifications
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists dedupe_key text,
  add column if not exists source_event_id text,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz;

update public.in_app_notifications
set dedupe_key = gen_random_uuid()::text
where dedupe_key is null;

alter table public.in_app_notifications
  alter column dedupe_key set default gen_random_uuid()::text,
  alter column dedupe_key set not null;

create unique index if not exists in_app_notifications_user_dedupe_key
  on public.in_app_notifications(user_id, dedupe_key);
create index if not exists in_app_notifications_user_created_idx
  on public.in_app_notifications(user_id, created_at desc);
create index if not exists in_app_notifications_workspace_created_idx
  on public.in_app_notifications(workspace_id, created_at desc);
create index if not exists in_app_notifications_unread_idx
  on public.in_app_notifications(user_id, created_at desc)
  where read = false and dismissed_at is null;

create table if not exists public.tech_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(endpoint)
);

create index if not exists tech_push_subscriptions_user_active_idx
  on public.tech_push_subscriptions(user_id, last_seen_at desc)
  where disabled_at is null;

create table if not exists public.in_app_notification_push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.in_app_notifications(id) on delete cascade,
  subscription_id uuid not null references public.tech_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','discarded')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(notification_id, subscription_id)
);

create index if not exists in_app_notification_push_outbox_pending_idx
  on public.in_app_notification_push_outbox(next_attempt_at, created_at)
  where status in ('pending','failed');

create or replace function public.touch_in_app_notification_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tech_push_subscriptions_touch_updated_at on public.tech_push_subscriptions;
create trigger tech_push_subscriptions_touch_updated_at
before update on public.tech_push_subscriptions
for each row execute function public.touch_in_app_notification_updated_at();

drop trigger if exists in_app_notifications_sync_read_at on public.in_app_notifications;
create or replace function public.sync_in_app_notification_read_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.read = true and (old.read = false or old.read_at is null) then
    new.read_at = coalesce(new.read_at, timezone('utc', now()));
  elsif new.read = false then
    new.read_at = null;
  end if;
  return new;
end;
$$;
create trigger in_app_notifications_sync_read_at
before update on public.in_app_notifications
for each row execute function public.sync_in_app_notification_read_at();

alter table public.in_app_notifications enable row level security;
alter table public.tech_push_subscriptions enable row level security;
alter table public.in_app_notification_push_outbox enable row level security;

drop policy if exists in_app_notifications_select_own on public.in_app_notifications;
create policy in_app_notifications_select_own
on public.in_app_notifications for select to authenticated
using (
  user_id = auth.uid()
  and (workspace_id is null or public.is_workspace_staff(workspace_id))
);

drop policy if exists in_app_notifications_insert_own on public.in_app_notifications;
create policy in_app_notifications_insert_own
on public.in_app_notifications for insert to authenticated
with check (
  user_id = auth.uid()
  and (workspace_id is null or public.is_workspace_staff(workspace_id))
);

drop policy if exists in_app_notifications_update_own on public.in_app_notifications;
create policy in_app_notifications_update_own
on public.in_app_notifications for update to authenticated
using (
  user_id = auth.uid()
  and (workspace_id is null or public.is_workspace_staff(workspace_id))
)
with check (
  user_id = auth.uid()
  and (workspace_id is null or public.is_workspace_staff(workspace_id))
);

drop policy if exists in_app_notifications_delete_own on public.in_app_notifications;
create policy in_app_notifications_delete_own
on public.in_app_notifications for delete to authenticated
using (
  user_id = auth.uid()
  and (workspace_id is null or public.is_workspace_staff(workspace_id))
);

drop policy if exists tech_push_subscriptions_select_own on public.tech_push_subscriptions;
create policy tech_push_subscriptions_select_own
on public.tech_push_subscriptions for select to authenticated
using (user_id = auth.uid() and (workspace_id is null or public.is_workspace_staff(workspace_id)));

drop policy if exists tech_push_subscriptions_insert_own on public.tech_push_subscriptions;
create policy tech_push_subscriptions_insert_own
on public.tech_push_subscriptions for insert to authenticated
with check (user_id = auth.uid() and (workspace_id is null or public.is_workspace_staff(workspace_id)));

drop policy if exists tech_push_subscriptions_update_own on public.tech_push_subscriptions;
create policy tech_push_subscriptions_update_own
on public.tech_push_subscriptions for update to authenticated
using (user_id = auth.uid() and (workspace_id is null or public.is_workspace_staff(workspace_id)))
with check (user_id = auth.uid() and (workspace_id is null or public.is_workspace_staff(workspace_id)));

drop policy if exists tech_push_subscriptions_delete_own on public.tech_push_subscriptions;
create policy tech_push_subscriptions_delete_own
on public.tech_push_subscriptions for delete to authenticated
using (user_id = auth.uid() and (workspace_id is null or public.is_workspace_staff(workspace_id)));

drop policy if exists in_app_notification_push_outbox_select_own on public.in_app_notification_push_outbox;
create policy in_app_notification_push_outbox_select_own
on public.in_app_notification_push_outbox for select to authenticated
using (exists (select 1 from public.in_app_notifications n where n.id = notification_id and n.user_id = auth.uid()));

-- The outbox is written and processed only by trusted server-side code.
revoke all on public.in_app_notification_push_outbox from authenticated, anon;
grant select on public.in_app_notification_push_outbox to authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'in_app_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
  END IF;
END
$$;

commit;
