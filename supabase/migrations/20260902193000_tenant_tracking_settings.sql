create table if not exists public.tenant_tracking_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ga4_measurement_id text,
  google_ads_id text,
  google_ads_conversion_label text,
  meta_pixel_id text,
  custom_head_script text,
  custom_body_script text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_tracking_meta_pixel_format check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{6,20}$'),
  constraint tenant_tracking_ga4_format check (ga4_measurement_id is null or ga4_measurement_id ~ '^G-[A-Z0-9]+$'),
  constraint tenant_tracking_google_ads_format check (google_ads_id is null or google_ads_id ~ '^AW-[0-9]+$')
);

alter table public.tenant_tracking_settings enable row level security;

drop policy if exists tenant_tracking_owner_select on public.tenant_tracking_settings;
create policy tenant_tracking_owner_select on public.tenant_tracking_settings
for select to authenticated using (auth.uid() = user_id);

drop policy if exists tenant_tracking_owner_insert on public.tenant_tracking_settings;
create policy tenant_tracking_owner_insert on public.tenant_tracking_settings
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists tenant_tracking_owner_update on public.tenant_tracking_settings;
create policy tenant_tracking_owner_update on public.tenant_tracking_settings
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tenant_tracking_public_enabled_select on public.tenant_tracking_settings;
create policy tenant_tracking_public_enabled_select on public.tenant_tracking_settings
for select to anon using (enabled = true);

grant select on public.tenant_tracking_settings to anon;
grant select, insert, update on public.tenant_tracking_settings to authenticated;

create or replace function public.set_tenant_tracking_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_tracking_settings_updated_at on public.tenant_tracking_settings;
create trigger tenant_tracking_settings_updated_at
before update on public.tenant_tracking_settings
for each row execute function public.set_tenant_tracking_updated_at();
