-- Read-only verification for the Phase 1 MOMS appointment-location backfill.
-- Run before migration to establish candidate counts, and after migration to
-- prove that the historical snapshot is complete and workspace-safe.

-- 1. Resolve the target workspace through its stable slug.
with moms as (
  select id as workspace_id
  from public.workspaces
  where slug::text = 'momsoilchange'
)
select
  count(*) as total_appointments,
  count(*) filter (where a.location_id is null) as missing_location_count,
  count(*) filter (where a.location_id is not null) as linked_location_count
from public.appointments a
join moms m on m.workspace_id = a.workspace_id;

-- 2. Every remaining null-location row must be explained. After a successful
-- backfill this query should return zero for MOMS historical rows with a source.
with moms as (
  select id as workspace_id
  from public.workspaces
  where slug::text = 'momsoilchange'
)
select
  a.id,
  a.created_at,
  a.source,
  nullif(trim(a.metadata->>'location_address'),'') as metadata_address,
  c.address_line1 as customer_address_line1,
  c.address_line2 as customer_address_line2,
  c.city,
  c.region,
  c.postal_code
from public.appointments a
join moms m on m.workspace_id = a.workspace_id
join public.customers c
  on c.workspace_id = a.workspace_id
 and c.id = a.customer_id
where a.location_id is null
  and (
    nullif(trim(coalesce(a.metadata->>'location_address','')),'') is not null
    or nullif(trim(coalesce(c.address_line1,'')),'') is not null
  )
order by a.created_at, a.id;

-- 3. No appointment may point to a location in another workspace.
select
  a.id as appointment_id,
  a.workspace_id as appointment_workspace_id,
  l.id as location_id,
  l.workspace_id as location_workspace_id
from public.appointments a
join public.locations l on l.id = a.location_id
where a.workspace_id <> l.workspace_id;

-- 4. Audit the backfill source distribution.
with moms as (
  select id as workspace_id
  from public.workspaces
  where slug::text = 'momsoilchange'
)
select
  a.metadata #>> '{location_backfill,source}' as source,
  count(*) as appointments
from public.appointments a
join moms m on m.workspace_id = a.workspace_id
where a.metadata ? 'location_backfill'
group by a.metadata #>> '{location_backfill,source}'
order by source;

-- 5. Confirm each historical backfilled appointment owns a dedicated location.
-- A count > 1 would mean a location row is shared by multiple appointments,
-- which is not allowed for the historical appointment snapshot created here.
with moms as (
  select id as workspace_id
  from public.workspaces
  where slug::text = 'momsoilchange'
)
select
  a.location_id,
  count(*) as appointment_count
from public.appointments a
join moms m on m.workspace_id = a.workspace_id
where a.location_id is not null
  and a.metadata ? 'location_backfill'
group by a.location_id
having count(*) > 1;

-- 6. Forward invariant: public bookings must always have appointment-owned
-- location. This must remain zero after the migration and on every future run.
with moms as (
  select id as workspace_id
  from public.workspaces
  where slug::text = 'momsoilchange'
)
select count(*) as public_bookings_missing_location
from public.appointments a
join moms m on m.workspace_id = a.workspace_id
where a.source = 'public_booking'
  and a.location_id is null;
