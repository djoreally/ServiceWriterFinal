begin;

create table if not exists public.account_import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_system text not null default 'lovable_account_export',
  source_version text not null,
  source_file_name text not null,
  source_sha256 text not null,
  status text not null default 'staged' check (status in ('staged','approved','running','completed','completed_with_errors','rolled_back','failed')),
  dry_run boolean not null default true,
  total_records integer not null default 0 check (total_records >= 0),
  imported_records integer not null default 0 check (imported_records >= 0),
  skipped_records integer not null default 0 check (skipped_records >= 0),
  failed_records integer not null default 0 check (failed_records >= 0),
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.account_import_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.account_import_batches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_section text not null,
  source_id text not null,
  target_table text,
  target_id uuid,
  action text not null check (action in ('created','matched','skipped','failed')),
  status text not null check (status in ('staged','committed','rolled_back','failed')),
  source_row jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (batch_id, source_section, source_id)
);

create table if not exists public.account_import_mappings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.account_import_batches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_section text not null,
  source_id text not null,
  target_table text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (batch_id, source_section, source_id),
  unique (workspace_id, source_section, source_id)
);

create index if not exists account_import_batches_workspace_created_idx on public.account_import_batches(workspace_id, created_at desc);
create index if not exists account_import_records_batch_status_idx on public.account_import_records(batch_id, status);
create index if not exists account_import_mappings_workspace_source_idx on public.account_import_mappings(workspace_id, source_section, source_id);

alter table public.account_import_batches enable row level security;
alter table public.account_import_records enable row level security;
alter table public.account_import_mappings enable row level security;

revoke all on table public.account_import_batches, public.account_import_records, public.account_import_mappings from public, anon;
grant select, insert, update, delete on table public.account_import_batches, public.account_import_records, public.account_import_mappings to authenticated;

drop policy if exists account_import_batches_admin_all on public.account_import_batches;
create policy account_import_batches_admin_all on public.account_import_batches for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists account_import_records_admin_all on public.account_import_records;
create policy account_import_records_admin_all on public.account_import_records for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists account_import_mappings_admin_all on public.account_import_mappings;
create policy account_import_mappings_admin_all on public.account_import_mappings for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

commit;
