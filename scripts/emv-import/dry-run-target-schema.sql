-- ============================================================================
-- LOCAL VERIFICATION ONLY — NOT A MIGRATION. NEVER APPLY TO PRODUCTION.
--
-- A disposable, prod-shaped target used to prove emv_import.sql end-to-end
-- against the real backup without touching production. Column sets and
-- nullability follow the production contract in
-- src/integrations/supabase/types.production.ts (cross-checked against the
-- 2026-11-05 reconciliation addendum's settled reads); enum vocabularies are
-- the settled production ones. It intentionally contains ONLY the tables the
-- pour touches, plus a service_catalog stub (FK target for the foundation
-- migration) and the MOMS workspace row the pour scopes to.
-- ============================================================================
begin;

create extension if not exists pgcrypto;

create type public.appointment_status as enum
  ('requested','confirmed','checked_in','in_progress','quality_check','ready_for_pickup',
   'completed','no_show','cancelled','rescheduled','on_hold','awaiting_parts');
create type public.invoice_status as enum
  ('draft','issued','partially_paid','paid','void','past_due');
create type public.payment_status as enum
  ('pending','succeeded','failed','refunded','partially_refunded');
create type public.customer_status as enum ('active','inactive','archived');
create type public.vehicle_status as enum ('active','inactive','sold','archived');
create type public.fleet_lifecycle_stage as enum
  ('prospect','onboarding','active','at_risk','churned');

create table public.workspaces (
  id uuid primary key,
  name text not null,
  slug text not null,
  timezone text not null,
  currency_code text not null,
  kind text not null,
  app_role text not null,
  created_by uuid not null,
  is_active boolean not null default true,
  legal_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code text not null default 'US',
  company_name text,
  notes text,
  status public.customer_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  customer_id uuid,
  year integer,
  make text,
  model text,
  trim text,
  vin text,
  license_plate text,
  plate_region text,
  color text,
  mileage integer,
  mileage_unit text not null default 'MI',
  status public.vehicle_status not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null,
  source text not null,
  confirmation_code text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  assigned_user_id uuid,
  location_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  appointment_id uuid,
  work_order_id uuid,
  quote_id uuid,
  customer_id uuid,
  vehicle_id uuid,
  status text not null,
  complaint text,
  diagnosis text,
  work_performed text,
  customer_notes text,
  internal_notes text,
  subtotal numeric,
  tax_amount numeric,
  tax_rate numeric,
  discount_amount numeric,
  total_amount numeric,
  currency_code text not null default 'USD',
  oil_quarts_used numeric,
  technician_id uuid,
  completed_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid,
  work_order_id uuid,
  invoice_number bigint not null,
  status public.invoice_status not null,
  subtotal numeric not null,
  tax_total numeric not null,
  total numeric not null,
  amount_paid numeric not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invoice_id uuid,
  customer_id uuid,
  provider text,
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  amount numeric not null,
  currency_code text not null default 'USD',
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_catalog (
  id uuid primary key default gen_random_uuid()
);

create table public.fleet_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  account_number text,
  billing_email text,
  billing_terms_days integer not null default 30,
  phone text,
  is_active boolean not null default true,
  lifecycle_stage public.fleet_lifecycle_stage not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fleet_client_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  fleet_client_id uuid not null,
  name text not null,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The MOMS workspace (the pour's target scope).
insert into public.workspaces (id, name, slug, timezone, currency_code, kind, app_role, created_by)
values ('250c258f-fad6-46e1-86de-3de41a7d4e1a', 'MOMS Mobile Oil Change', 'moms',
        'America/New_York', 'USD', 'shop', 'admin', '425ce961-9bfe-4d25-94a7-483b3d6eba61');

commit;
