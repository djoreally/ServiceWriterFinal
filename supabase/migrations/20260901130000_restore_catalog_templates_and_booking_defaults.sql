-- Restore the catalog contract used by the service library and public booking.
-- This migration is additive so it is safe for partially upgraded workspaces.

begin;

alter table public.service_catalog
  add column if not exists default_price numeric not null default 0,
  add column if not exists estimated_duration integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_upsell boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists category_id uuid,
  add column if not exists template_id uuid,
  add column if not exists service_vertical text not null default 'general',
  add column if not exists pricing_mode text not null default 'flat',
  add column if not exists service_intent text,
  add column if not exists requires_tire_quantity boolean not null default false,
  add column if not exists requires_fitment_lookup boolean not null default false,
  add column if not exists requires_inventory_selection boolean not null default false,
  add column if not exists allows_manual_fitment boolean not null default true;

alter table public.service_categories
  add column if not exists parent_id uuid references public.service_categories(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

alter table public.service_templates
  add column if not exists description text,
  add column if not exists default_price numeric not null default 0,
  add column if not exists labor_rate numeric,
  add column if not exists duration_minutes integer,
  add column if not exists skill_level text,
  add column if not exists notes text,
  add column if not exists service_vertical text not null default 'general',
  add column if not exists pricing_mode text not null default 'flat',
  add column if not exists service_intent text,
  add column if not exists requires_tire_quantity boolean not null default false,
  add column if not exists requires_fitment_lookup boolean not null default false,
  add column if not exists requires_inventory_selection boolean not null default false,
  add column if not exists allows_manual_fitment boolean not null default true,
  add column if not exists is_upsell boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

create table if not exists public.service_package_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  discount_type text not null default 'fixed',
  discount_value numeric not null default 0,
  estimated_duration integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric not null default 0,
  billing_cycle text not null default 'monthly',
  tier text,
  features jsonb not null default '[]'::jsonb,
  included_services jsonb not null default '[]'::jsonb,
  max_services_per_cycle integer,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.service_categories (name, slug, booking_requirements, sort_order)
values
  ('Oil & Fluids', 'oil-fluids', array['basic_vehicle', 'oil_fitment'], 10),
  ('Preventive Maintenance', 'preventive-maintenance', array['basic_vehicle'], 20),
  ('Brakes & Safety', 'brakes-safety', array['basic_vehicle'], 30),
  ('Tire Services', 'tire-services', array['basic_vehicle', 'tire_fitment', 'tire_quantity'], 40),
  ('Detailing', 'detailing', array['basic_vehicle', 'detailing_assessment'], 50),
  ('Add-ons', 'add-ons', array['basic_vehicle'], 60)
on conflict (slug) do update set
  name = excluded.name,
  booking_requirements = excluded.booking_requirements,
  sort_order = excluded.sort_order;

insert into public.service_templates (
  category_id, name, slug, booking_requirements, description, default_price, duration_minutes,
  service_vertical, pricing_mode, service_intent, requires_tire_quantity,
  requires_fitment_lookup, requires_inventory_selection, allows_manual_fitment, is_upsell, is_active, sort_order
)
select c.id, t.name, t.slug, t.booking_requirements, t.description, t.default_price, t.duration_minutes,
  t.service_vertical, t.pricing_mode, t.service_intent, t.requires_tire_quantity,
  t.requires_fitment_lookup, t.requires_inventory_selection, t.allows_manual_fitment, t.is_upsell, true, t.sort_order
from (
  values
    ('oil-fluids', 'Conventional Oil Change', 'conventional-oil-change', array['basic_vehicle', 'oil_fitment']::text[], 'Oil and filter service matched to the selected vehicle.', 49.99::numeric, 45, 'general', 'labor_parts', null::text, false, false, false, true, false, 10),
    ('oil-fluids', 'Synthetic Blend Oil Change', 'synthetic-blend-oil-change', array['basic_vehicle', 'oil_fitment']::text[], 'Synthetic-blend oil and filter service matched to the selected vehicle.', 69.99::numeric, 45, 'general', 'labor_parts', null::text, false, false, false, true, false, 20),
    ('oil-fluids', 'Full Synthetic Oil Change', 'full-synthetic-oil-change', array['basic_vehicle', 'oil_fitment']::text[], 'Full synthetic oil and filter service matched to the selected vehicle.', 89.99::numeric, 45, 'general', 'labor_parts', null::text, false, false, false, true, false, 30),
    ('preventive-maintenance', 'Tire Rotation', 'tire-rotation', array['basic_vehicle']::text[], 'Rotate tires and inspect tread wear.', 29.99::numeric, 30, 'tires', 'flat', 'rotation', false, false, false, true, false, 40),
    ('preventive-maintenance', 'Multi-Point Inspection', 'multi-point-inspection', array['basic_vehicle']::text[], 'Inspect key safety and maintenance systems.', 0::numeric, 30, 'general', 'flat', null::text, false, false, false, true, false, 50),
    ('brakes-safety', 'Brake Inspection', 'brake-inspection', array['basic_vehicle']::text[], 'Inspect pads, rotors, fluid, and brake hardware.', 29.99::numeric, 30, 'general', 'quote_required', null::text, false, false, false, true, false, 60),
    ('tire-services', 'Tire Replacement & Installation', 'tire-replacement-installation', array['basic_vehicle', 'tire_fitment', 'tire_quantity']::text[], 'Select vehicle-specific tire fitment and quantity.', 25::numeric, 90, 'tires', 'tire_inventory', 'replacement', true, true, true, true, false, 70),
    ('tire-services', 'Flat Tire Repair', 'flat-tire-repair', array['basic_vehicle', 'tire_fitment']::text[], 'Repair a puncture after confirming tire fitment.', 29.99::numeric, 45, 'tires', 'flat', 'repair', false, true, false, true, false, 80),
    ('detailing', 'Interior Detail', 'interior-detail', array['basic_vehicle', 'detailing_assessment']::text[], 'Interior cleaning with vehicle condition assessment.', 129.99::numeric, 120, 'detailing', 'detailing_assessment', null::text, false, false, false, true, false, 90),
    ('detailing', 'Exterior Detail', 'exterior-detail', array['basic_vehicle', 'detailing_assessment']::text[], 'Exterior wash and protection with vehicle condition assessment.', 119.99::numeric, 120, 'detailing', 'detailing_assessment', null::text, false, false, false, true, false, 100),
    ('add-ons', 'Engine Air Filter', 'engine-air-filter', array['basic_vehicle']::text[], 'Replace the engine air filter after fitment confirmation.', 24.99::numeric, 15, 'general', 'labor_parts', null::text, false, true, false, true, true, 110),
    ('add-ons', 'Cabin Air Filter', 'cabin-air-filter', array['basic_vehicle']::text[], 'Replace the cabin air filter after fitment confirmation.', 29.99::numeric, 15, 'general', 'labor_parts', null::text, false, true, false, true, true, 120),
    ('add-ons', 'Wiper Blade Replacement', 'wiper-blade-replacement', array['basic_vehicle']::text[], 'Replace front or rear wiper blades after fitment confirmation.', 24.99::numeric, 15, 'general', 'labor_parts', null::text, false, true, false, true, true, 130)
) as t(category_slug, name, slug, booking_requirements, description, default_price, duration_minutes, service_vertical, pricing_mode, service_intent, requires_tire_quantity, requires_fitment_lookup, requires_inventory_selection, allows_manual_fitment, is_upsell, sort_order)
join public.service_categories c on c.slug = t.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id,
  booking_requirements = excluded.booking_requirements,
  description = excluded.description,
  default_price = excluded.default_price,
  duration_minutes = excluded.duration_minutes,
  service_vertical = excluded.service_vertical,
  pricing_mode = excluded.pricing_mode,
  service_intent = excluded.service_intent,
  requires_tire_quantity = excluded.requires_tire_quantity,
  requires_fitment_lookup = excluded.requires_fitment_lookup,
  requires_inventory_selection = excluded.requires_inventory_selection,
  allows_manual_fitment = excluded.allows_manual_fitment,
  is_upsell = excluded.is_upsell,
  is_active = true,
  sort_order = excluded.sort_order;

insert into public.service_package_templates (name, description, discount_type, discount_value, estimated_duration, sort_order)
values
  ('Essential Maintenance', 'Full synthetic oil change, tire rotation, and multi-point inspection.', 'percentage', 10, 90, 10),
  ('Seasonal Safety', 'Tire rotation, brake inspection, and multi-point inspection.', 'percentage', 10, 75, 20),
  ('Complete Care', 'Full synthetic oil change, tire rotation, and interior detail.', 'percentage', 15, 210, 30)
on conflict (name) do update set
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  estimated_duration = excluded.estimated_duration,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.subscription_plan_templates (name, description, price, billing_cycle, tier, features, included_services, max_services_per_cycle, display_order)
values
  ('Essential Care', 'Routine maintenance membership for one vehicle.', 29.99, 'monthly', 'essential', '["Priority scheduling", "Multi-point inspections"]'::jsonb, '["Oil Change", "Tire Rotation"]'::jsonb, 2, 10),
  ('Complete Care', 'Maintenance membership with expanded seasonal coverage.', 49.99, 'monthly', 'complete', '["Priority scheduling", "Multi-point inspections", "Service reminders"]'::jsonb, '["Oil Change", "Tire Rotation", "Brake Inspection"]'::jsonb, 3, 20)
on conflict (name) do update set
  description = excluded.description,
  price = excluded.price,
  billing_cycle = excluded.billing_cycle,
  tier = excluded.tier,
  features = excluded.features,
  included_services = excluded.included_services,
  max_services_per_cycle = excluded.max_services_per_cycle,
  display_order = excluded.display_order,
  is_active = true;

-- New workspaces start with disposal fees disabled. The public UI charges this
-- fee only when an oil service is selected, so unrelated bookings never start
-- with a waste-oil charge.
alter table public.workspace_settings alter column waste_oil_fee_enabled set default false;

commit;
