-- Reconcile legacy UI contracts that are still used by public booking,
-- inventory, subscriptions, and marketing recovery screens.
-- This migration is additive and safe to run against partially upgraded workspaces.

create extension if not exists pgcrypto;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  sku text,
  category text,
  description text,
  unit text not null default 'ea',
  quantity numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  sell_price numeric not null default 0,
  unit_cost numeric not null default 0,
  image_url text,
  reorder_url text,
  tire_size text,
  tire_load_index text,
  tire_speed_rating text,
  tire_season text,
  tire_position text,
  is_warehouse_item boolean not null default false,
  origin_source text,
  data_origin text not null default 'manual',
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_name_idx on public.inventory_items(user_id, name);
create index if not exists inventory_items_user_low_stock_idx on public.inventory_items(user_id, quantity, low_stock_threshold);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  price numeric not null default 0,
  price_min numeric,
  price_max numeric,
  billing_cycle text not null default 'monthly',
  tier text,
  features jsonb not null default '[]'::jsonb,
  included_services jsonb not null default '[]'::jsonb,
  max_services_per_cycle integer,
  is_active boolean not null default true,
  is_template boolean not null default false,
  display_order integer not null default 0,
  badge_label text,
  badge_color text,
  highlight boolean not null default false,
  cta_label text,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_plans_user_active_order_idx on public.subscription_plans(user_id, is_active, display_order);

create table if not exists public.abandoned_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  guest_email text,
  guest_name text,
  guest_phone text,
  session_id text,
  service_catalog_id uuid references public.service_catalog(id) on delete set null,
  scheduled_date date,
  scheduled_time text,
  last_step integer not null default 0,
  attempt_count integer not null default 1,
  status text not null default 'pending',
  recovered boolean not null default false,
  recovered_at timestamptz,
  email_sent_at timestamptz,
  recovery_sent_at timestamptz,
  last_attempted_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abandoned_bookings_user_updated_idx on public.abandoned_bookings(user_id, updated_at desc);
create unique index if not exists abandoned_bookings_active_email_idx
  on public.abandoned_bookings(user_id, lower(guest_email))
  where recovered = false and guest_email is not null;
create unique index if not exists abandoned_bookings_active_session_idx
  on public.abandoned_bookings(user_id, session_id)
  where recovered = false and session_id is not null;

create or replace function public.set_legacy_contract_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at before update on public.inventory_items
for each row execute function public.set_legacy_contract_updated_at();
drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at before update on public.subscription_plans
for each row execute function public.set_legacy_contract_updated_at();
drop trigger if exists abandoned_bookings_updated_at on public.abandoned_bookings;
create trigger abandoned_bookings_updated_at before update on public.abandoned_bookings
for each row execute function public.set_legacy_contract_updated_at();

alter table public.inventory_items enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.abandoned_bookings enable row level security;

drop policy if exists inventory_items_owner_all on public.inventory_items;
create policy inventory_items_owner_all on public.inventory_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists subscription_plans_owner_all on public.subscription_plans;
create policy subscription_plans_owner_all on public.subscription_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists abandoned_bookings_owner_read on public.abandoned_bookings;
create policy abandoned_bookings_owner_read on public.abandoned_bookings for select to authenticated using (user_id = auth.uid());
drop policy if exists abandoned_bookings_owner_write on public.abandoned_bookings;
create policy abandoned_bookings_owner_write on public.abandoned_bookings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists abandoned_bookings_public_insert on public.abandoned_bookings;
create policy abandoned_bookings_public_insert on public.abandoned_bookings for insert to anon, authenticated with check (user_id is not null);
drop policy if exists abandoned_bookings_public_update_by_session on public.abandoned_bookings;
create policy abandoned_bookings_public_update_by_session on public.abandoned_bookings for update to anon using (session_id is not null) with check (session_id is not null);

-- Restores the package-template button contract. The function is intentionally
-- conservative: it copies only active templates and does not fabricate services.
create or replace function public.populate_user_service_packages(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  template_row record;
begin
  if p_user_id is null or (auth.uid() is not null and auth.uid() <> p_user_id) then
    raise exception 'not authorized';
  end if;

  for template_row in
    select id, name, description, discount_type, discount_value, estimated_duration
    from public.service_package_templates
    where coalesce(is_active, true)
    order by coalesce(sort_order, 0), name
  loop
    insert into public.service_packages
      (user_id, name, description, package_price, discount_type, discount_value, estimated_duration, is_active)
    select p_user_id, template_row.name, template_row.description, 0,
           template_row.discount_type, template_row.discount_value,
           template_row.estimated_duration, true
    where not exists (
      select 1 from public.service_packages p
      where p.user_id = p_user_id and lower(p.name) = lower(template_row.name)
    );
    inserted_count := inserted_count + case when found then 1 else 0 end;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.populate_user_service_packages(uuid) from public, anon;
grant execute on function public.populate_user_service_packages(uuid) to authenticated, service_role;
