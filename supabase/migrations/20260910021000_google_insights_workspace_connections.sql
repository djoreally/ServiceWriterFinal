create table if not exists public.google_insights_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  connected_by uuid not null references auth.users(id) on delete cascade,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  analytics_property_id text,
  analytics_property_name text,
  business_location_id text,
  business_location_name text,
  needs_reauth boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_insights_connections enable row level security;
revoke all on table public.google_insights_connections from anon, authenticated;
create index if not exists google_insights_connections_connected_by_idx
  on public.google_insights_connections(connected_by);
