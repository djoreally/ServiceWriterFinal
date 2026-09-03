drop policy if exists tenant_tracking_owner_select on public.tenant_tracking_settings;
create policy tenant_tracking_owner_select on public.tenant_tracking_settings
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists tenant_tracking_owner_insert on public.tenant_tracking_settings;
create policy tenant_tracking_owner_insert on public.tenant_tracking_settings
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists tenant_tracking_owner_update on public.tenant_tracking_settings;
create policy tenant_tracking_owner_update on public.tenant_tracking_settings
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.tenant_tracking_settings from anon;
grant select (user_id, ga4_measurement_id, google_ads_id, google_ads_conversion_label, meta_pixel_id, enabled)
on public.tenant_tracking_settings to anon;
