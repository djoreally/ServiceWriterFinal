begin;

create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_name text,
  phone text,
  email citext,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) not null default 'US',
  website_url text,
  logo_url text,
  booking_slug citext unique,
  terminology jsonb not null default '{"customer":"Customer","vehicle":"Vehicle","service":"Service","quote":"Quote"}'::jsonb,
  opening_time time,
  closing_time time,
  working_days text[] not null default array['Monday','Tuesday','Wednesday','Thursday','Friday']::text[],
  day_hours jsonb not null default '{}'::jsonb,
  service_radius_miles numeric,
  buffer_time_before integer not null default 0,
  buffer_time_after integer not null default 0,
  min_lead_time_hours integer not null default 2,
  max_advance_days integer not null default 30,
  slot_duration_minutes integer not null default 30,
  allow_multi_day_bookings boolean not null default false,
  require_approval boolean not null default false,
  cancellation_window_hours integer not null default 24,
  allow_cancellation boolean not null default true,
  allow_rescheduling boolean not null default true,
  reschedule_window_hours integer not null default 24,
  terms_and_conditions text,
  require_terms_acceptance boolean not null default false,
  tax_rate numeric not null default 0,
  oil_price_per_quart numeric not null default 0,
  waste_oil_fee numeric not null default 0,
  waste_oil_fee_enabled boolean not null default false,
  shop_fee_enabled boolean not null default false,
  shop_fee_type text not null default 'fixed',
  shop_fee_value numeric not null default 0,
  shop_fee_description text,
  surcharge_enabled boolean not null default false,
  surcharge_type text not null default 'percentage',
  surcharge_value numeric not null default 0,
  surcharge_description text,
  payment_provider text,
  booking_enabled boolean not null default true,
  marketplace_opt_in boolean not null default false,
  operational_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_settings_service_radius_nonnegative check (service_radius_miles is null or service_radius_miles >= 0),
  constraint workspace_settings_nonnegative_windows check (
    buffer_time_before >= 0 and buffer_time_after >= 0 and min_lead_time_hours >= 0 and
    max_advance_days >= 0 and slot_duration_minutes > 0 and cancellation_window_hours >= 0 and
    reschedule_window_hours >= 0 and tax_rate >= 0 and oil_price_per_quart >= 0 and
    waste_oil_fee >= 0 and shop_fee_value >= 0 and surcharge_value >= 0
  )
);

alter table public.workspace_settings enable row level security;

drop policy if exists workspace_settings_member_select on public.workspace_settings;
create policy workspace_settings_member_select on public.workspace_settings
for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_settings_staff_write on public.workspace_settings;
create policy workspace_settings_staff_write on public.workspace_settings
for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));

drop trigger if exists workspace_settings_set_updated_at on public.workspace_settings;
create trigger workspace_settings_set_updated_at
before update on public.workspace_settings
for each row execute function public.set_updated_at();

create table if not exists public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null,
  service_catalog_id uuid,
  item_type text not null default 'service',
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  is_prepaid boolean not null default false,
  added_at_service boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_items_quantity_positive check (quantity > 0),
  constraint appointment_items_unit_price_nonnegative check (unit_price >= 0),
  constraint appointment_items_type_check check (item_type in ('service','labor','part','fee','discount')),
  constraint appointment_items_workspace_appointment_fk foreign key (workspace_id, appointment_id)
    references public.appointments(workspace_id, id) on delete cascade,
  constraint appointment_items_workspace_service_fk foreign key (workspace_id, service_catalog_id)
    references public.service_catalog(workspace_id, id) on delete set null
);

create index if not exists appointment_items_workspace_appointment_idx
  on public.appointment_items(workspace_id, appointment_id);

alter table public.appointment_items enable row level security;

drop policy if exists appointment_items_staff_all on public.appointment_items;
create policy appointment_items_staff_all on public.appointment_items
for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));

drop policy if exists appointment_items_customer_select on public.appointment_items;
create policy appointment_items_customer_select on public.appointment_items
for select to authenticated using (
  exists (
    select 1 from public.appointments a
    where a.workspace_id = appointment_items.workspace_id
      and a.id = appointment_items.appointment_id
      and public.is_customer_for_workspace(a.workspace_id, a.customer_id)
  )
);

drop trigger if exists appointment_items_set_updated_at on public.appointment_items;
create trigger appointment_items_set_updated_at
before update on public.appointment_items
for each row execute function public.set_updated_at();

create table if not exists public.vehicle_service_specs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vehicle_id uuid not null,
  engine text,
  oil_type text,
  oil_capacity text,
  oil_filter text,
  source text not null default 'historical_import',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_service_specs_workspace_vehicle_fk foreign key (workspace_id, vehicle_id)
    references public.vehicles(workspace_id, id) on delete cascade,
  constraint vehicle_service_specs_workspace_vehicle_unique unique (workspace_id, vehicle_id)
);

alter table public.vehicle_service_specs enable row level security;

drop policy if exists vehicle_service_specs_staff_all on public.vehicle_service_specs;
create policy vehicle_service_specs_staff_all on public.vehicle_service_specs
for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));

drop policy if exists vehicle_service_specs_customer_select on public.vehicle_service_specs;
create policy vehicle_service_specs_customer_select on public.vehicle_service_specs
for select to authenticated using (
  exists (
    select 1 from public.vehicles v
    where v.workspace_id = vehicle_service_specs.workspace_id
      and v.id = vehicle_service_specs.vehicle_id
      and v.customer_id is not null
      and public.is_customer_for_workspace(v.workspace_id, v.customer_id)
  )
);

drop trigger if exists vehicle_service_specs_set_updated_at on public.vehicle_service_specs;
create trigger vehicle_service_specs_set_updated_at
before update on public.vehicle_service_specs
for each row execute function public.set_updated_at();

alter table public.service_records
  add column if not exists customer_id uuid,
  add column if not exists vehicle_id uuid;

create index if not exists service_records_workspace_customer_idx
  on public.service_records(workspace_id, customer_id);
create index if not exists service_records_workspace_vehicle_idx
  on public.service_records(workspace_id, vehicle_id);

alter table public.service_records
  drop constraint if exists service_records_workspace_customer_fk;
alter table public.service_records
  add constraint service_records_workspace_customer_fk foreign key (workspace_id, customer_id)
  references public.customers(workspace_id, id) on delete set null;

alter table public.service_records
  drop constraint if exists service_records_workspace_vehicle_fk;
alter table public.service_records
  add constraint service_records_workspace_vehicle_fk foreign key (workspace_id, vehicle_id)
  references public.vehicles(workspace_id, id) on delete set null;

alter table public.appointments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.payments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

commit;
