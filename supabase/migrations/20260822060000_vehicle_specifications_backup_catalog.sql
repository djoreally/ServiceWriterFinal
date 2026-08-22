-- Backup/reference vehicle specification catalog.
-- This migration is intentionally independent of workspace-owned operational vehicles.
create table if not exists public.vehicle_specifications (
  record_id text primary key,
  year integer not null check (year between 1900 and 2100),
  make text not null,
  model text not null,
  engine text,
  oil_type text,
  oil_capacity text,
  oil_filter text,
  transmission_fluid text,
  source text not null,
  additional_specs jsonb not null default '{}'::jsonb,
  verification_status text not null check (verification_status in ('verified', 'unverified', 'incomplete')),
  missing_fields text not null default '',
  merge_key text not null unique,
  imported_at timestamptz not null default timezone('utc', now())
);

alter table public.vehicle_specifications enable row level security;
revoke all on public.vehicle_specifications from anon, authenticated;
