-- Built-in first-party telemetry — Service Writer's own product analytics.
--
-- Copied from the MOMS website's first-party telemetry system
-- (momsoilchange.com: TelemetrySession / TelemetryEvent, migration
-- 20260920160000_first_party_telemetry) and extended for a multi-tenant
-- signed-in platform:
--
--   * TWO event streams share this one store, separated by `stream`:
--       - 'app'     — signed-in app activity: every event is stamped with
--                     the acting user's id + email, workspace_id and role,
--                     so an owner/admin can reconstruct exactly what a
--                     user looked at, screen by screen, in order.
--       - 'booking' — the PUBLIC booking funnel for a workspace: an
--                     anonymous visitor's journey (landing → address →
--                     vehicle → service → time → details → payment →
--                     confirmed) under one visitor session id, with
--                     workspace_id and funnel_step on every event.
--   * The website's session/event shape is preserved (client-minted
--     session id as PK, visitor id, entry/exit url, referrer, utm,
--     device class, browser, viewport, pageview + engaged counters;
--     events carry url/path/title, click target + text, position
--     ratios, scroll depth, engaged ms and a metadata jsonb bag).
--
-- Read posture (deliberate): there is NO self-read. Ordinary signed-in
-- users — including the people being tracked — get no SELECT policy on
-- these tables at all. Reads exist only for (a) workspace owners/admins
-- scoped to their own workspace, and (b) platform admins (user_roles
-- 'admin', the same record the platform admin audit read checks).
-- Writes: an authenticated user can only write rows stamped with their
-- own user id; anonymous funnel rows (user_id null) are written by the
-- server-side ingest route after it validates the workspace.

create table if not exists public.telemetry_sessions (
  id text primary key,
  stream text not null default 'app' check (stream in ('app', 'booking')),
  visitor_id text,
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  role text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  entry_url text not null,
  exit_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_class text,
  browser text,
  viewport_width integer,
  viewport_height integer,
  pageviews integer not null default 0,
  engaged_ms integer not null default 0
);

create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.telemetry_sessions (id) on delete cascade,
  stream text not null default 'app' check (stream in ('app', 'booking')),
  visitor_id text,
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  role text,
  event_type text not null,
  funnel_step text,
  url text not null,
  path text not null,
  title text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  referrer text,
  target text,
  target_text text,
  x_ratio double precision,
  y_ratio double precision,
  scroll_depth integer,
  engaged_ms integer,
  viewport_width integer,
  viewport_height integer,
  metadata jsonb
);

create index if not exists telemetry_sessions_started_at_idx
  on public.telemetry_sessions (started_at);
create index if not exists telemetry_sessions_visitor_id_idx
  on public.telemetry_sessions (visitor_id);
create index if not exists telemetry_sessions_workspace_started_idx
  on public.telemetry_sessions (workspace_id, started_at);
create index if not exists telemetry_sessions_user_started_idx
  on public.telemetry_sessions (user_id, started_at);

create index if not exists telemetry_events_event_type_occurred_idx
  on public.telemetry_events (event_type, occurred_at);
create index if not exists telemetry_events_path_occurred_idx
  on public.telemetry_events (path, occurred_at);
create index if not exists telemetry_events_session_occurred_idx
  on public.telemetry_events (session_id, occurred_at);
create index if not exists telemetry_events_workspace_occurred_idx
  on public.telemetry_events (workspace_id, occurred_at);
create index if not exists telemetry_events_user_occurred_idx
  on public.telemetry_events (user_id, occurred_at);
create index if not exists telemetry_events_funnel_idx
  on public.telemetry_events (workspace_id, funnel_step, occurred_at)
  where funnel_step is not null;

alter table public.telemetry_sessions enable row level security;
alter table public.telemetry_events enable row level security;

-- Writes: a signed-in user writes only their own app-stream rows.
drop policy if exists telemetry_sessions_insert_own on public.telemetry_sessions;
create policy telemetry_sessions_insert_own on public.telemetry_sessions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists telemetry_events_insert_own on public.telemetry_events;
create policy telemetry_events_insert_own on public.telemetry_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Session counters/last-seen are maintained by the ingest route on the
-- writer's own session rows only.
drop policy if exists telemetry_sessions_update_own on public.telemetry_sessions;
create policy telemetry_sessions_update_own on public.telemetry_sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Reads: workspace owners/admins, own workspace only.
drop policy if exists telemetry_sessions_workspace_admin_select on public.telemetry_sessions;
create policy telemetry_sessions_workspace_admin_select on public.telemetry_sessions
  for select to authenticated
  using (
    workspace_id is not null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = telemetry_sessions.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists telemetry_events_workspace_admin_select on public.telemetry_events;
create policy telemetry_events_workspace_admin_select on public.telemetry_events
  for select to authenticated
  using (
    workspace_id is not null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = telemetry_events.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
        and wm.role in ('owner', 'admin')
    )
  );

-- Reads: platform admins (cross-platform), same user_roles record the
-- platform audit read checks.
drop policy if exists telemetry_sessions_platform_admin_select on public.telemetry_sessions;
create policy telemetry_sessions_platform_admin_select on public.telemetry_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'::public.app_role
    )
  );

drop policy if exists telemetry_events_platform_admin_select on public.telemetry_events;
create policy telemetry_events_platform_admin_select on public.telemetry_events
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'::public.app_role
    )
  );
