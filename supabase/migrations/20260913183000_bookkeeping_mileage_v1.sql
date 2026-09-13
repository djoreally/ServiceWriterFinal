-- Bookkeeping v1 expansion: mileage and business accounting settings.
-- Additive; does not alter existing appointment, expense, invoice or payment behavior.

create table if not exists public.bookkeeping_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  mileage_enabled boolean not null default true,
  mileage_round_trip boolean not null default true,
  mileage_rate_per_mile numeric(8,4) not null default 0,
  fiscal_year_start_month integer not null default 1,
  minimum_cash_reserve numeric(14,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bookkeeping_settings_month_check check (fiscal_year_start_month between 1 and 12),
  constraint bookkeeping_settings_nonnegative_check check (mileage_rate_per_mile >= 0 and minimum_cash_reserve >= 0)
);

create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid null references public.appointments(id) on delete set null,
  trip_date date not null,
  purpose text not null default 'Customer service appointment',
  origin_address text null,
  destination_address text null,
  origin_lat numeric(10,7) null,
  origin_lng numeric(10,7) null,
  destination_lat numeric(10,7) null,
  destination_lng numeric(10,7) null,
  one_way_miles numeric(10,2) not null,
  total_miles numeric(10,2) not null,
  mileage_rate numeric(8,4) not null default 0,
  deductible_value numeric(12,2) not null default 0,
  calculation_method text not null default 'mapbox_route',
  status text not null default 'tracked',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mileage_trips_workspace_appointment_key unique (workspace_id, appointment_id),
  constraint mileage_trips_nonnegative_check check (one_way_miles >= 0 and total_miles >= 0 and mileage_rate >= 0 and deductible_value >= 0),
  constraint mileage_trips_method_check check (calculation_method in ('mapbox_route','haversine_fallback','manual')),
  constraint mileage_trips_status_check check (status in ('tracked','review','excluded'))
);

create index if not exists mileage_trips_workspace_date_idx
  on public.mileage_trips(workspace_id, trip_date desc);
create index if not exists mileage_trips_workspace_status_idx
  on public.mileage_trips(workspace_id, status, trip_date desc);

alter table public.bookkeeping_settings enable row level security;
alter table public.mileage_trips enable row level security;
alter table public.bookkeeping_settings force row level security;
alter table public.mileage_trips force row level security;

create policy bookkeeping_settings_select_member on public.bookkeeping_settings
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy bookkeeping_settings_write_finance on public.bookkeeping_settings
  for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));

create policy mileage_trips_select_member on public.mileage_trips
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy mileage_trips_write_finance on public.mileage_trips
  for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));

grant select, insert, update, delete on public.bookkeeping_settings to authenticated;
grant select, insert, update, delete on public.mileage_trips to authenticated;
