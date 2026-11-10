-- Platform stats RPC (2026-11-10) — the Admin Overview's front door.
--
-- GET /v1/platform/stats has called rpc("get_platform_stats") since the
-- route was migrated, but the function never existed in production (the
-- Oct-10 reverse-engineered file 20261010000190 is a raising stub from
-- the E3 batch and was never applied). The Overview tab 500'd on every
-- load; the admin examination of 2026-11-10 named it.
--
-- The handler's contract (platform.ts): the function returns one jsonb
-- object with usersCount, vehiclesCount, servicesCount,
-- appointmentsCount, totalRevenue, shopsCount. Definitions, on record:
--   usersCount        = business_profiles rows (registered shop accounts)
--   shopsCount        = workspaces with is_active (the handler's
--                       "activeShops")
--   vehiclesCount     = vehicles rows
--   appointmentsCount = appointments rows
--   servicesCount     = service_records rows (services performed — the
--                       work/warranty record; no services table exists
--                       until Recon Step 8, and a catalog count would
--                       not be "services" in this card's sense)
--   totalRevenue      = sum(payments.amount) where status = 'succeeded'
--                       — the Item-4 collected definition, platform-wide.
--
-- SECURITY DEFINER: the route's client is the caller's RLS-bound client
-- (requirePlatformAdmin), so row-level counts would only see the
-- admin's own workspaces. The function counts platform-wide; the ROUTE
-- stays platform-admin gated, and EXECUTE is granted to authenticated
-- only (never anon). search_path is pinned.

create or replace function public.get_platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usersCount', (select count(*) from public.business_profiles),
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
