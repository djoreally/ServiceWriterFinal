-- SW-82/83: CARFAX feed run records — the audit log for the production
-- generator (src/server/carfax). Every generation/transfer attempt writes
-- exactly one row: workspace, kind (HIST/PROD), file name, record + row
-- counts, the file's SHA-256, the outcome status, and the error when one
-- occurred. This is the workspace-scoped write side the export monitor was
-- missing (audit G6: the legacy carfax_exports table is user-scoped and its
-- write path was a no-op); this table does not replace it — it records the
-- automated feed runs, which are a different producer.
--
-- Expand-only: one new table, no changes to existing tables or functions.
-- The generator runs as a trusted server job (service role, which bypasses
-- RLS); the single SELECT policy below exists so workspace owners/admins can
-- read their own shop's run history from the app later.

create table if not exists public.carfax_feed_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('HIST', 'PROD')),
  file_name text not null,
  record_count integer not null default 0,
  row_count integer not null default 0,
  sha256 text,
  status text not null check (status in (
    'running', 'generated', 'dry_run', 'validation_failed', 'upload_failed', 'uploaded', 'failed'
  )),
  error text,
  dry_run boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.carfax_feed_runs is
  'One row per CARFAX feed generation/transfer attempt (SW-82/83). Written by the trusted generator job (service role); read by workspace owners/admins. sha256 is the hex digest of the exact file content generated.';

create index if not exists carfax_feed_runs_workspace_created_idx
  on public.carfax_feed_runs (workspace_id, created_at desc);

alter table public.carfax_feed_runs enable row level security;

-- Reads: workspace owners/admins, own workspace only (same shape as the
-- telemetry read policies). No insert/update/delete policy for authenticated
-- users: writes are the generator job's alone (service role bypasses RLS).
drop policy if exists carfax_feed_runs_workspace_admin_select on public.carfax_feed_runs;
create policy carfax_feed_runs_workspace_admin_select on public.carfax_feed_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = carfax_feed_runs.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
        and wm.role in ('owner', 'admin')
    )
  );
