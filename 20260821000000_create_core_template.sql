-- Phase 1 greenfield schema for a multi-tenant shop + fleet management application.
-- Apply only to a new Supabase project after review.
-- Security model: auth.users -> profiles -> workspace_members; every tenant-owned
-- row carries workspace_id and is protected by helper functions below.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Compatibility enums retained from the supplied replacement template.
create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.user_role as enum ('owner', 'manager', 'technician', 'viewer');
create type public.filter_brand as enum ('fram', 'wix', 'purolator', 'ac_delco', 'motorcraft', 'bosch', 'k_n', 'mobil1', 'other');
create type public.filter_type as enum ('oil', 'air', 'cabin', 'fuel', 'transmission', 'hydraulic', 'pcv', 'breather');
create type public.fleet_lifecycle_stage as enum ('prospect', 'onboarding', 'active', 'at_risk', 'churned');

create type public.workspace_kind as enum ('shop', 'fleet', 'hybrid');
-- Application roles are intentionally a superset of the template's user_role enum.
-- The template role values remain available for compatibility; operational scopes
-- such as dispatcher and fleet_manager are represented as explicit capabilities.
create type public.member_role as enum ('owner', 'admin', 'manager', 'service_advisor', 'technician', 'dispatcher', 'receptionist', 'fleet_manager', 'viewer', 'customer');
create type public.customer_status as enum ('active', 'inactive', 'archived');
create type public.vehicle_status as enum ('active', 'inactive', 'sold', 'archived');
create type public.appointment_status as enum ('requested', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.work_order_status as enum ('draft', 'scheduled', 'assigned', 'in_progress', 'waiting_for_parts', 'awaiting_approval', 'completed', 'cancelled');
create type public.work_order_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'void', 'past_due');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type public.location_type as enum ('shop', 'mobile', 'fleet_site', 'customer_site');
create type public.fleet_request_status as enum ('new', 'triaged', 'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled');
create type public.integration_provider as enum ('stripe', 'square', 'quickbooks', 'google_calendar', 'resend', 'sms', 'carfax', 'mapbox', 'ai', 'other');

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end; $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  kind public.workspace_kind not null default 'shop',
  app_role public.app_role not null default 'user',
  legal_name text,
  timezone text not null default 'UTC',
  currency_code char(3) not null default 'USD',
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  primary key (workspace_id, user_id)
);

create table public.customer_users (
  customer_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (customer_id, user_id)
);

create table public.locations (
  constraint locations_workspace_id_id_key unique (workspace_id, id),
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  location_type public.location_type not null default 'shop',
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) not null default 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.customer_status not null default 'active',
  first_name text not null,
  last_name text not null,
  company_name text,
  email citext,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) not null default 'US',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, id)
);

alter table public.customer_users add constraint customer_users_customer_fk
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete cascade;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid,
  status public.vehicle_status not null default 'active',
  vin text,
  year smallint,
  make text,
  model text,
  trim text,
  license_plate text,
  plate_region text,
  color text,
  mileage integer,
  mileage_unit text not null default 'mi',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete set null
);
create unique index vehicles_workspace_vin_idx on public.vehicles(workspace_id, vin) where vin is not null;

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text,
  estimated_minutes integer,
  labor_price numeric(12,2) not null default 0 check (labor_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, id)
);

create table public.filter_catalog (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand public.filter_brand not null default 'other',
  filter_type public.filter_type not null,
  part_number text not null,
  description text,
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, brand, filter_type, part_number)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid,
  location_id uuid,
  assigned_user_id uuid references public.profiles(id),
  status public.appointment_status not null default 'requested',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'staff',
  confirmation_code text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete restrict,
  foreign key (workspace_id, vehicle_id) references public.vehicles(workspace_id, id) on delete set null,
  foreign key (workspace_id, location_id) references public.locations(workspace_id, id) on delete set null
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid,
  customer_id uuid not null,
  vehicle_id uuid,
  location_id uuid,
  status public.work_order_status not null default 'draft',
  priority public.work_order_priority not null default 'normal',
  number bigint generated always as identity,
  complaint text,
  diagnosis text,
  technician_notes text,
  opened_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, number),
  foreign key (workspace_id, appointment_id) references public.appointments(workspace_id, id) on delete set null,
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete restrict,
  foreign key (workspace_id, vehicle_id) references public.vehicles(workspace_id, id) on delete set null,
  foreign key (workspace_id, location_id) references public.locations(workspace_id, id) on delete set null
);

create table public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_order_id uuid not null,
  service_catalog_id uuid,
  item_type text not null check (item_type in ('service', 'labor', 'part', 'fee', 'discount')),
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(7,4) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete cascade,
  foreign key (workspace_id, service_catalog_id) references public.service_catalog(workspace_id, id) on delete set null
);

create table public.work_order_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_order_id uuid not null,
  user_id uuid not null references public.profiles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default timezone('utc', now()),
  unassigned_at timestamptz,
  primary key (work_order_id, user_id),
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete cascade
);

create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_order_id uuid not null,
  actor_user_id uuid references public.profiles(id),
  event_type text not null,
  from_status public.work_order_status,
  to_status public.work_order_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete cascade
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid,
  work_order_id uuid,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'declined', 'expired', 'converted')),
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete restrict,
  foreign key (workspace_id, vehicle_id) references public.vehicles(workspace_id, id) on delete set null,
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete set null
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid,
  work_order_id uuid,
  status public.invoice_status not null default 'draft',
  invoice_number bigint generated always as identity,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  due_at timestamptz,
  issued_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, invoice_number),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete restrict,
  foreign key (workspace_id, vehicle_id) references public.vehicles(workspace_id, id) on delete set null,
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete set null
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(7,4) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, invoice_id) references public.invoices(workspace_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid,
  customer_id uuid,
  provider public.integration_provider,
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  amount numeric(12,2) not null check (amount >= 0),
  currency_code char(3) not null default 'USD',
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_payment_id),
  foreign key (workspace_id, invoice_id) references public.invoices(workspace_id, id) on delete set null,
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete set null
);

create table public.fleet_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  account_number text,
  billing_email citext,
  phone text,
  billing_terms_days integer not null default 30 check (billing_terms_days >= 0),
  lifecycle_stage public.fleet_lifecycle_stage not null default 'prospect',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, id)
);

create table public.fleet_client_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fleet_client_id uuid not null,
  name text not null,
  email citext,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, fleet_client_id) references public.fleet_clients(workspace_id, id) on delete cascade
);

create table public.fleet_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fleet_client_id uuid not null,
  name text not null,
  contract_number text,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'cancelled')),
  terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  foreign key (workspace_id, fleet_client_id) references public.fleet_clients(workspace_id, id) on delete cascade
);

create table public.fleet_service_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fleet_client_id uuid not null,
  fleet_contract_id uuid,
  vehicle_id uuid,
  location_id uuid,
  status public.fleet_request_status not null default 'new',
  priority public.work_order_priority not null default 'normal',
  requested_service text not null,
  requested_for timestamptz,
  external_reference text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (workspace_id, fleet_client_id) references public.fleet_clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, fleet_contract_id) references public.fleet_contracts(workspace_id, id) on delete set null,
  foreign key (workspace_id, vehicle_id) references public.vehicles(workspace_id, id) on delete set null,
  foreign key (workspace_id, location_id) references public.locations(workspace_id, id) on delete set null
);

create table public.fleet_dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_request_id uuid not null,
  work_order_id uuid,
  technician_id uuid not null references public.profiles(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'assigned' check (status in ('assigned', 'en_route', 'on_site', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  foreign key (workspace_id, service_request_id) references public.fleet_service_requests(workspace_id, id) on delete cascade,
  foreign key (workspace_id, work_order_id) references public.work_orders(workspace_id, id) on delete set null
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider public.integration_provider not null,
  external_account_id text,
  status text not null default 'connected' check (status in ('pending', 'connected', 'revoked', 'error')),
  scopes text[] not null default '{}',
  secret_reference text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, provider)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  provider public.integration_provider not null,
  external_event_id text not null,
  event_type text not null,
  signature_verified boolean not null default false,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  payload jsonb not null,
  error_message text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id) where is_active;
create index filter_catalog_workspace_type_idx on public.filter_catalog(workspace_id, filter_type, brand);
create index customers_workspace_name_idx on public.customers(workspace_id, last_name, first_name);
create index vehicles_workspace_customer_idx on public.vehicles(workspace_id, customer_id);
create index appointments_workspace_time_idx on public.appointments(workspace_id, starts_at);
create index work_orders_workspace_status_idx on public.work_orders(workspace_id, status, priority);
create index fleet_requests_workspace_status_idx on public.fleet_service_requests(workspace_id, status, priority);
create index audit_events_workspace_time_idx on public.audit_events(workspace_id, created_at desc);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.is_workspace_staff(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_workspace_role(target_workspace_id, array['owner','admin','manager','service_advisor','technician','dispatcher','receptionist','fleet_manager']::public.member_role[]);
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_workspace_role(target_workspace_id, array['owner','admin']::public.member_role[]);
$$;

create or replace function public.is_customer_for_workspace(target_workspace_id uuid, target_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customer_users cu
    where cu.workspace_id = target_workspace_id
      and cu.customer_id = target_customer_id
      and cu.user_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_technician(target_workspace_id uuid, target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_order_assignments a
    where a.workspace_id = target_workspace_id
      and a.work_order_id = target_work_order_id
      and a.user_id = auth.uid()
      and a.unassigned_at is null
  );
$$;

-- New-user profile creation. Workspaces and memberships must be created through
-- an authenticated server action or controlled RPC, not by trusting the client.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated-at triggers.
do $$ declare t text; begin
  foreach t in array array['profiles','workspaces','workspace_members','locations','customers','vehicles','service_catalog','filter_catalog','appointments','work_orders','work_order_items','quotes','invoices','payments','fleet_clients','fleet_contracts','fleet_service_requests','fleet_dispatch_assignments','provider_connections'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Enable RLS on every tenant-owned table. webhook_events is intentionally
-- service-role-only for Phase 1; audit_events is readable by workspace staff.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.customer_users enable row level security;
alter table public.locations enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_catalog enable row level security;
alter table public.filter_catalog enable row level security;
alter table public.appointments enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_items enable row level security;
alter table public.work_order_assignments enable row level security;
alter table public.work_order_events enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.fleet_clients enable row level security;
alter table public.fleet_client_contacts enable row level security;
alter table public.fleet_contracts enable row level security;
alter table public.fleet_service_requests enable row level security;
alter table public.fleet_dispatch_assignments enable row level security;
alter table public.provider_connections enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_member_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_admin_update on public.workspaces for update to authenticated using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy members_member_select on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy members_admin_insert on public.workspace_members for insert to authenticated with check (public.is_workspace_admin(workspace_id));
create policy members_admin_update on public.workspace_members for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy members_admin_delete on public.workspace_members for delete to authenticated using (public.is_workspace_admin(workspace_id));

create policy customer_users_staff_select on public.customer_users for select to authenticated using (public.is_workspace_staff(workspace_id));
create policy customer_users_self_select on public.customer_users for select to authenticated using (user_id = auth.uid());
create policy customer_users_admin_write on public.customer_users for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- Generic staff policies for first-release operational tables.
create policy locations_staff_all on public.locations for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy customers_staff_all on public.customers for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy customers_customer_select on public.customers for select to authenticated using (public.is_customer_for_workspace(workspace_id, id));
create policy vehicles_staff_all on public.vehicles for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy vehicles_customer_select on public.vehicles for select to authenticated using (public.is_customer_for_workspace(workspace_id, customer_id));
create policy catalog_staff_all on public.service_catalog for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy filter_catalog_staff_all on public.filter_catalog for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));

create policy appointments_staff_all on public.appointments for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy appointments_customer_select on public.appointments for select to authenticated using (public.is_customer_for_workspace(workspace_id, customer_id));
create policy work_orders_staff_all on public.work_orders for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy work_orders_technician_select on public.work_orders for select to authenticated using (public.is_assigned_technician(workspace_id, id));
create policy work_orders_customer_select on public.work_orders for select to authenticated using (public.is_customer_for_workspace(workspace_id, customer_id));

create policy work_order_items_staff_all on public.work_order_items for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy work_order_items_customer_select on public.work_order_items for select to authenticated using (exists (select 1 from public.work_orders w where w.workspace_id = work_order_items.workspace_id and w.id = work_order_items.work_order_id and public.is_customer_for_workspace(w.workspace_id, w.customer_id)));
create policy assignments_staff_all on public.work_order_assignments for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy assignments_self_select on public.work_order_assignments for select to authenticated using (user_id = auth.uid());
create policy work_order_events_staff_all on public.work_order_events for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy work_order_events_customer_select on public.work_order_events for select to authenticated using (exists (select 1 from public.work_orders w where w.workspace_id = work_order_events.workspace_id and w.id = work_order_events.work_order_id and public.is_customer_for_workspace(w.workspace_id, w.customer_id)));

create policy quotes_staff_all on public.quotes for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy quotes_customer_select on public.quotes for select to authenticated using (public.is_customer_for_workspace(workspace_id, customer_id));
create policy invoices_staff_all on public.invoices for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy invoices_customer_select on public.invoices for select to authenticated using (public.is_customer_for_workspace(workspace_id, customer_id));
create policy invoice_lines_staff_all on public.invoice_lines for all to authenticated using (public.is_workspace_staff(workspace_id));
create policy invoice_lines_customer_select on public.invoice_lines for select to authenticated using (exists (select 1 from public.invoices i where i.workspace_id = invoice_lines.workspace_id and i.id = invoice_lines.invoice_id and public.is_customer_for_workspace(i.workspace_id, i.customer_id)));
create policy payments_staff_all on public.payments for all to authenticated using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy payments_customer_select on public.payments for select to authenticated using (customer_id is not null and public.is_customer_for_workspace(workspace_id, customer_id));

create policy fleet_clients_staff_all on public.fleet_clients for all to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[])) with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[]));
create policy fleet_contacts_staff_all on public.fleet_client_contacts for all to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[])) with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[]));
create policy fleet_contracts_staff_all on public.fleet_contracts for all to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin','manager','fleet_manager']::public.member_role[])) with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','fleet_manager']::public.member_role[]));
create policy fleet_requests_staff_all on public.fleet_service_requests for all to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager','service_advisor']::public.member_role[])) with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager','service_advisor']::public.member_role[]));
create policy fleet_dispatch_staff_all on public.fleet_dispatch_assignments for all to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[])) with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','dispatcher','fleet_manager']::public.member_role[]));
create policy fleet_dispatch_technician_select on public.fleet_dispatch_assignments for select to authenticated using (technician_id = auth.uid());

create policy provider_connections_admin_select on public.provider_connections for select to authenticated using (public.is_workspace_admin(workspace_id));
create policy provider_connections_admin_write on public.provider_connections for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy audit_events_staff_select on public.audit_events for select to authenticated using (workspace_id is null or public.is_workspace_staff(workspace_id));

-- No client policies for webhook_events: service_role only.

commit;
