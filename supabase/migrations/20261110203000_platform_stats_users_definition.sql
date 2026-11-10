-- Platform stats: usersCount definition corrected (2026-11-10).
--
-- The first apply of get_platform_stats (20261110202000) verified live
-- and returned usersCount = 0 — accurately: public.business_profiles
-- has ZERO rows in production (corroborated by a direct count in the
-- same verification pass). The profile table was never populated in
-- this deployment; shop identity lives in workspaces +
-- workspace_settings. A "Total Users" card reading 0 on a platform
-- with 4 active workspaces and real members would be a false number
-- even though the count itself is exact.
--
-- Corrected definition, on record:
--   usersCount = distinct user_id among ACTIVE workspace_members
--                (the platform's actual user accounts)
-- Every other key keeps the 20261110202000 definition. The function is
-- recreated whole so its live body stays self-documenting.

create or replace function public.get_platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usersCount', (select count(distinct user_id) from public.workspace_members where is_active),
    'vehiclesCount', (select count(*) from public.vehicles),
    'servicesCount', (select count(*) from public.service_records),
    'appointmentsCount', (select count(*) from public.appointments),
    'totalRevenue', (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded'),
    'shopsCount', (select count(*) from public.workspaces where is_active)
  );
$$;

revoke all on function public.get_platform_stats() from public;
grant execute on function public.get_platform_stats() to authenticated;
grant execute on function public.get_platform_stats() to service_role;
