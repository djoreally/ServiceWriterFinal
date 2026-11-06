-- ============================================================================
-- EMV HISTORY IMPORT — the pour.
--
-- Rebuilds the rescued emv backup (moms_260814.backup, 2026-08-14) into the
-- current Service Writer production model. Design + verified inventory:
-- goals/service-writer-app-redesign-and-repo/files/
--   emv-rebuild-inventory-2026-11-05.md
--
-- HOW IT RUNS: scripts/emv-import/run-emv-import.sh restores the backup into
-- a scratch database, stages the 9 needed tables into the TARGET database as
-- schema `emv_staging`, then runs this file inside ONE transaction. The
-- runner ends the transaction with ROLLBACK (dry run) or COMMIT (real pour,
-- Ty's word only). This file never begins/commits by itself.
--
-- REQUIRED psql variables (runner supplies them):
--   workspace_id    uuid  target workspace (MOMS)
--   workspace_tz    text  tz for date+time composition, e.g. America/New_York
--   import_batch    text  provenance label stamped into metadata, e.g. emv-2026-08-14
--   source_user_id  uuid  the emv account that owns the book (Ty's)
--
-- RULES BAKED IN (Ty's rulings + house discipline):
--   * Every value self-sources from emv_staging or from the target itself
--     (invoice numbers = target MAX + row_number, computed in-transaction).
--     No transcribed IDs anywhere.
--   * Matching order per entity: provenance (metadata emv id) -> normalized
--     email -> normalized phone (customers); VIN -> year/make/model scoped to
--     the mapped customer (vehicles); email/name (fleet). A row is reused
--     ONLY on an unambiguous hit. Ambiguity or contradiction = CONFLICT:
--     the row and its dependents are skipped and listed. Never silently merged.
--   * Status values are cast to the enum types (public.appointment_status /
--     public.invoice_status — the types provably exist in prod: prod's own
--     functions cast with them). The cast is safe under both documented
--     realities for the columns themselves: enum value -> text column
--     coerces back via I/O, enum value -> enum column is identity. A bare
--     text column expression does NOT assignment-cast to an enum (proven
--     by the first dry run), hence the explicit casts.
--   * Idempotent: a re-run links everything by provenance and inserts nothing.
--   * Specs go to the ARCHIVE table only (emv_archive_vehicle_specifications).
--     The struck public.vehicle_specifications is never created or touched.
--   * Pending payment_records (no money moved) and financial_transactions
--     (exact mirrors of the succeeded payment_records) are NOT poured; both
--     are listed as skips with reasons.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 0. Guards + run bookkeeping. Guards are plain SQL (psql does not expand
--    variables inside dollar-quoted bodies): a CHECK (ok is true) violation
--    aborts the run under ON_ERROR_STOP before anything is written.
-- ---------------------------------------------------------------------------
create temp table emv_guard (check_name text primary key, ok boolean not null check (ok is true));
insert into emv_guard values
  ('workspace_exists', exists (select 1 from public.workspaces where id = :'workspace_id'::uuid)),
  ('staging_present', to_regclass('emv_staging.customers') is not null),
  ('appointment_services_present', to_regclass('public.appointment_services') is not null),
  ('archive_table_present', to_regclass('public.emv_archive_vehicle_specifications') is not null);

create temp table emv_rep (seq serial, line text);
create temp table emv_map_customer (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_vehicle (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_appointment (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_service (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_invoice (emv_service_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_payment (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_map_fleet (emv_id uuid primary key, target_id uuid not null, action text not null);
create temp table emv_conflicts (entity text, emv_id uuid, reason text, detail text);
create temp table emv_skips (entity text, emv_id uuid, reason text, detail text);
create temp table emv_notices (entity text, emv_id uuid, notice text, detail text);

insert into emv_rep(line) values
  ('EMV IMPORT REPORT — batch ' || :'import_batch' || ' — workspace ' || :'workspace_id' || ' — tz ' || :'workspace_tz');

-- ---------------------------------------------------------------------------
-- 1. CUSTOMERS (177)
--    Order: provenance -> email -> phone -> insert.
-- ---------------------------------------------------------------------------
-- 1a. provenance
insert into emv_map_customer
select c.id, t.id, 'linked_provenance'
from emv_staging.customers c
join public.customers t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_customer_id' = c.id::text;

-- 1b. email (normalized), unambiguous only
with cand as (
  select c.id as emv_id, count(t.id) as n, min(t.id::text)::uuid as only_id
  from emv_staging.customers c
  join public.customers t
    on t.workspace_id = :'workspace_id'::uuid
   and nullif(lower(btrim(t.email)), '') = nullif(lower(btrim(c.email)), '')
  where c.email is not null
    and c.id not in (select emv_id from emv_map_customer)
  group by c.id
)
insert into emv_map_customer select emv_id, only_id, 'linked_email' from cand where n = 1;
with cand as (
  select c.id as emv_id, count(t.id) as n
  from emv_staging.customers c
  join public.customers t
    on t.workspace_id = :'workspace_id'::uuid
   and nullif(lower(btrim(t.email)), '') = nullif(lower(btrim(c.email)), '')
  where c.email is not null
    and c.id not in (select emv_id from emv_map_customer)
  group by c.id
)
insert into emv_conflicts
select 'customer', emv_id, 'multi_email_match',
       'email matches ' || n || ' existing customers in target workspace — not merged'
from cand where n > 1;

-- 1c. phone (digits, US country code stripped), unambiguous + no email contradiction
with cand as (
  select c.id as emv_id, t.id as tid, t.email as t_email, c.email as c_email,
         count(*) over (partition by c.id) as n
  from emv_staging.customers c
  join public.customers t
    on t.workspace_id = :'workspace_id'::uuid
   and (case when length(regexp_replace(t.phone, '\D', '', 'g')) = 11 and left(regexp_replace(t.phone, '\D', '', 'g'), 1) = '1'
             then substring(regexp_replace(t.phone, '\D', '', 'g') from 2)
             else regexp_replace(t.phone, '\D', '', 'g') end)
     = (case when length(regexp_replace(c.phone, '\D', '', 'g')) = 11 and left(regexp_replace(c.phone, '\D', '', 'g'), 1) = '1'
             then substring(regexp_replace(c.phone, '\D', '', 'g') from 2)
             else regexp_replace(c.phone, '\D', '', 'g') end)
  where c.phone is not null
    and nullif(regexp_replace(c.phone, '\D', '', 'g'), '') is not null
    and c.id not in (select emv_id from emv_map_customer)
    and c.id not in (select emv_id from emv_conflicts where entity = 'customer')
)
insert into emv_map_customer
select emv_id, tid, 'linked_phone' from cand
where n = 1 and (t_email is null or nullif(lower(btrim(t_email)), '') = nullif(lower(btrim(c_email)), ''));
with cand as (
  select c.id as emv_id, t.id as tid, t.email as t_email, c.email as c_email,
         count(*) over (partition by c.id) as n
  from emv_staging.customers c
  join public.customers t
    on t.workspace_id = :'workspace_id'::uuid
   and (case when length(regexp_replace(t.phone, '\D', '', 'g')) = 11 and left(regexp_replace(t.phone, '\D', '', 'g'), 1) = '1'
             then substring(regexp_replace(t.phone, '\D', '', 'g') from 2)
             else regexp_replace(t.phone, '\D', '', 'g') end)
     = (case when length(regexp_replace(c.phone, '\D', '', 'g')) = 11 and left(regexp_replace(c.phone, '\D', '', 'g'), 1) = '1'
             then substring(regexp_replace(c.phone, '\D', '', 'g') from 2)
             else regexp_replace(c.phone, '\D', '', 'g') end)
  where c.phone is not null
    and nullif(regexp_replace(c.phone, '\D', '', 'g'), '') is not null
    and c.id not in (select emv_id from emv_map_customer)
    and c.id not in (select emv_id from emv_conflicts where entity = 'customer')
)
insert into emv_conflicts
select 'customer', emv_id,
       case when n > 1 then 'multi_phone_match' else 'phone_match_email_conflict' end,
       case when n > 1 then 'phone matches ' || n || ' existing customers — not merged'
            else 'phone matches an existing customer whose email differs — not merged' end
from cand
where n > 1 or (t_email is not null and nullif(lower(btrim(t_email)), '') is distinct from nullif(lower(btrim(c_email)), ''));

-- 1d. everyone left inserts new
with ins as (
  insert into public.customers
    (workspace_id, first_name, last_name, email, phone,
     address_line1, city, region, postal_code, country_code,
     notes, status, metadata, created_at, updated_at, created_by)
  select :'workspace_id'::uuid,
         split_part(btrim(c.name), ' ', 1),
         case when position(' ' in btrim(c.name)) > 0
              then btrim(substr(btrim(c.name), position(' ' in btrim(c.name)) + 1)) else '' end,
         nullif(btrim(c.email), ''),
         nullif(btrim(c.phone), ''),
         c.address,
         (regexp_match(c.address, ',\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$'))[1],
         upper((regexp_match(c.address, ',\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$'))[2]),
         (regexp_match(c.address, ',\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$'))[3],
         'US',
         c.notes,
         'active',
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_customer_id', c.id,
           'emv_user_id', c.user_id,
           'emv_address_verbatim', c.address,
           'emv_lifetime_value', c.lifetime_value,
           'emv_total_services', c.total_services,
           'emv_average_order_value', c.average_order_value,
           'emv_segment', c.customer_segment,
           'emv_acquisition_source', c.acquisition_source,
           'emv_first_service_date', c.first_service_date,
           'emv_last_service_date', c.last_service_date),
         c.created_at, c.updated_at, null
  from emv_staging.customers c
  where c.id not in (select emv_id from emv_map_customer)
    and c.id not in (select emv_id from emv_conflicts where entity = 'customer')
  returning id, metadata ->> 'emv_customer_id' as emv_id
)
insert into emv_map_customer select emv_id::uuid, id, 'inserted' from ins;

-- within-source shared-phone notice (data quirk, not a merge signal)
insert into emv_notices
select 'customer', null, 'shared_phone_in_source',
       'phone ' || phone || ' is shared by ' || n || ' distinct emv customers (distinct emails) — poured as separate customers'
from (select phone, count(*) as n from emv_staging.customers
      where coalesce(phone, '') <> '' group by phone having count(*) > 1) d;
-- the one email-less customer pours on phone strength alone — flag her
insert into emv_notices
select 'customer', id, 'email_less_customer',
       'no email in source; matched/inserted on phone only (' || coalesce(phone, '-') || ')'
from emv_staging.customers where email is null;

-- ---------------------------------------------------------------------------
-- 2. VEHICLES (209) — scoped to the mapped customer.
--    VIN (17-char) -> (year, make, model) -> insert.
-- ---------------------------------------------------------------------------
-- staging vehicles whose customer never mapped (conflict) are skipped
insert into emv_skips
select 'vehicle', v.id, 'customer_not_mapped',
       'customer ' || v.customer_id || ' was conflict-skipped; vehicle not poured'
from emv_staging.vehicles v
where v.customer_id is not null
  and v.customer_id not in (select emv_id from emv_map_customer);

-- 2a. provenance
insert into emv_map_vehicle
select v.id, t.id, 'linked_provenance'
from emv_staging.vehicles v
join public.vehicles t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_vehicle_id' = v.id::text
where v.id not in (select emv_id from emv_skips where entity = 'vehicle');

-- 2b. VIN within the mapped customer
with cand as (
  select v.id as emv_id, count(t.id) as n, min(t.id::text)::uuid as only_id
  from emv_staging.vehicles v
  join emv_map_customer mc on mc.emv_id = v.customer_id
  join public.vehicles t
    on t.workspace_id = :'workspace_id'::uuid
   and t.customer_id = mc.target_id
   and upper(btrim(t.vin)) = upper(btrim(v.vin))
  where v.vin is not null and length(btrim(v.vin)) = 17
    and v.id not in (select emv_id from emv_map_vehicle)
    and v.id not in (select emv_id from emv_skips where entity = 'vehicle')
  group by v.id
)
insert into emv_map_vehicle select emv_id, only_id, 'linked_vin' from cand where n = 1;
with cand as (
  select v.id as emv_id, count(t.id) as n
  from emv_staging.vehicles v
  join emv_map_customer mc on mc.emv_id = v.customer_id
  join public.vehicles t
    on t.workspace_id = :'workspace_id'::uuid
   and t.customer_id = mc.target_id
   and upper(btrim(t.vin)) = upper(btrim(v.vin))
  where v.vin is not null and length(btrim(v.vin)) = 17
    and v.id not in (select emv_id from emv_map_vehicle)
    and v.id not in (select emv_id from emv_skips where entity = 'vehicle')
  group by v.id
)
insert into emv_conflicts
select 'vehicle', emv_id, 'multi_vin_match', 'VIN matches ' || n || ' vehicles of the same customer — not merged'
from cand where n > 1;
-- VIN that belongs to a DIFFERENT customer in the target: conflict, never cross-merge
insert into emv_conflicts
select 'vehicle', v.id, 'vin_owned_by_other_customer',
       'VIN ' || upper(btrim(v.vin)) || ' already exists under a different customer in the target — not merged, vehicle skipped'
from emv_staging.vehicles v
join emv_map_customer mc on mc.emv_id = v.customer_id
join public.vehicles t
  on t.workspace_id = :'workspace_id'::uuid
 and upper(btrim(t.vin)) = upper(btrim(v.vin))
 and t.customer_id is distinct from mc.target_id
where v.vin is not null and length(btrim(v.vin)) = 17
  and v.id not in (select emv_id from emv_map_vehicle)
  and v.id not in (select emv_id from emv_conflicts where entity = 'vehicle')
  and v.id not in (select emv_id from emv_skips where entity = 'vehicle');
insert into emv_skips
select 'vehicle', emv_id, 'vin_conflict', 'see conflict vin_owned_by_other_customer'
from emv_conflicts where entity = 'vehicle' and reason = 'vin_owned_by_other_customer';

-- 2c. (year, make, model) within the mapped customer
with cand as (
  select v.id as emv_id, count(t.id) as n, min(t.id::text)::uuid as only_id
  from emv_staging.vehicles v
  join emv_map_customer mc on mc.emv_id = v.customer_id
  join public.vehicles t
    on t.workspace_id = :'workspace_id'::uuid
   and t.customer_id = mc.target_id
   and t.year = v.year
   and lower(t.make) = lower(v.make)
   and lower(t.model) = lower(v.model)
  where v.id not in (select emv_id from emv_map_vehicle)
    and v.id not in (select emv_id from emv_conflicts where entity = 'vehicle')
    and v.id not in (select emv_id from emv_skips where entity = 'vehicle')
  group by v.id
)
insert into emv_map_vehicle select emv_id, only_id, 'linked_ymm' from cand where n = 1;
with cand as (
  select v.id as emv_id, count(t.id) as n
  from emv_staging.vehicles v
  join emv_map_customer mc on mc.emv_id = v.customer_id
  join public.vehicles t
    on t.workspace_id = :'workspace_id'::uuid
   and t.customer_id = mc.target_id
   and t.year = v.year
   and lower(t.make) = lower(v.make)
   and lower(t.model) = lower(v.model)
  where v.id not in (select emv_id from emv_map_vehicle)
    and v.id not in (select emv_id from emv_conflicts where entity = 'vehicle')
    and v.id not in (select emv_id from emv_skips where entity = 'vehicle')
  group by v.id
)
insert into emv_conflicts
select 'vehicle', emv_id, 'multi_ymm_match',
       'year/make/model matches ' || n || ' vehicles of the same customer and no VIN decides it — vehicle skipped (appointments pour with no vehicle)'
from cand where n > 1;
insert into emv_skips
select 'vehicle', emv_id, 'ymm_conflict', 'see conflict multi_ymm_match'
from emv_conflicts where entity = 'vehicle' and reason = 'multi_ymm_match';

-- 2d. insert the rest (including the one customer-less vehicle)
with ins as (
  insert into public.vehicles
    (workspace_id, customer_id, year, make, model, vin, license_plate, plate_region,
     color, mileage, notes, status, mileage_unit, metadata, created_at, updated_at)
  select :'workspace_id'::uuid,
         mc.target_id,
         v.year, v.make, v.model,
         nullif(btrim(v.vin), ''),
         v.license_plate, v.plate_state,
         v.color, v.mileage, v.notes,
         'active',
         coalesce(nullif(v.odometer_measure, ''), 'MI'),
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_vehicle_id', v.id,
           'emv_user_id', v.user_id,
           'emv_engine', v.engine,
           'emv_oil_type', v.oil_type,
           'emv_oil_capacity', v.oil_capacity),
         v.created_at, v.updated_at
  from emv_staging.vehicles v
  left join emv_map_customer mc on mc.emv_id = v.customer_id
  where v.id not in (select emv_id from emv_map_vehicle)
    and v.id not in (select emv_id from emv_conflicts where entity = 'vehicle')
    and v.id not in (select emv_id from emv_skips where entity = 'vehicle')
    and (v.customer_id is null or mc.target_id is not null)
  returning id, metadata ->> 'emv_vehicle_id' as emv_id
)
insert into emv_map_vehicle select emv_id::uuid, id, 'inserted' from ins;

-- ---------------------------------------------------------------------------
-- 3. APPOINTMENTS (188) — history rows; provenance-checked, never deduped.
--    Customer resolution: staging customer map; the guest appointment via
--    guest email/phone; foreign-tenant row pours with a crossover notice.
-- ---------------------------------------------------------------------------
create temp table emv_appt_customer (emv_appt_id uuid primary key, target_customer_id uuid not null, how text not null);

-- 3a. provenance (re-run): map straight from target metadata
insert into emv_map_appointment
select a.id, t.id, 'linked_provenance'
from emv_staging.appointments a
join public.appointments t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_appointment_id' = a.id::text;

-- 3b. resolve customers for the rest
insert into emv_appt_customer
select a.id, mc.target_id, 'staging_customer'
from emv_staging.appointments a
join emv_map_customer mc on mc.emv_id = a.customer_id
where a.id not in (select emv_id from emv_map_appointment);

-- guest appointment: guest email (rank 1) then guest phone (rank 2) -> a mapped
-- staging customer. Two different customers tied at the best rank = conflict.
with cand as (
  select a.id as appt_id, c.id as cust_id,
         case when nullif(lower(btrim(c.email)), '') = nullif(lower(btrim(a.guest_email)), '') then 1 else 2 end as rnk
  from emv_staging.appointments a
  join emv_staging.customers c
    on (a.guest_email is not null and nullif(lower(btrim(c.email)), '') = nullif(lower(btrim(a.guest_email)), ''))
    or (a.guest_phone is not null
        and (case when length(regexp_replace(c.phone, '\D', '', 'g')) = 11 and left(regexp_replace(c.phone, '\D', '', 'g'), 1) = '1'
                  then substring(regexp_replace(c.phone, '\D', '', 'g') from 2)
                  else regexp_replace(c.phone, '\D', '', 'g') end)
          = (case when length(regexp_replace(a.guest_phone, '\D', '', 'g')) = 11 and left(regexp_replace(a.guest_phone, '\D', '', 'g'), 1) = '1'
                  then substring(regexp_replace(a.guest_phone, '\D', '', 'g') from 2)
                  else regexp_replace(a.guest_phone, '\D', '', 'g') end))
  join emv_map_customer mc on mc.emv_id = c.id
  where a.customer_id is null
    and a.id not in (select emv_id from emv_map_appointment)
    and a.id not in (select emv_appt_id from emv_appt_customer)
),
best as (
  select appt_id, min(rnk) as best_rnk from cand group by appt_id
),
winners as (
  select cand.appt_id, count(distinct cand.cust_id) as n, min(cand.cust_id::text)::uuid as only_cust
  from cand join best on best.appt_id = cand.appt_id and cand.rnk = best.best_rnk
  group by cand.appt_id
)
insert into emv_appt_customer
select w.appt_id, mc.target_id, 'guest_matched_staging_customer'
from winners w
join emv_map_customer mc on mc.emv_id = w.only_cust
where w.n = 1;
with cand as (
  select a.id as appt_id, c.id as cust_id,
         case when nullif(lower(btrim(c.email)), '') = nullif(lower(btrim(a.guest_email)), '') then 1 else 2 end as rnk
  from emv_staging.appointments a
  join emv_staging.customers c
    on (a.guest_email is not null and nullif(lower(btrim(c.email)), '') = nullif(lower(btrim(a.guest_email)), ''))
    or (a.guest_phone is not null
        and (case when length(regexp_replace(c.phone, '\D', '', 'g')) = 11 and left(regexp_replace(c.phone, '\D', '', 'g'), 1) = '1'
                  then substring(regexp_replace(c.phone, '\D', '', 'g') from 2)
                  else regexp_replace(c.phone, '\D', '', 'g') end)
          = (case when length(regexp_replace(a.guest_phone, '\D', '', 'g')) = 11 and left(regexp_replace(a.guest_phone, '\D', '', 'g'), 1) = '1'
                  then substring(regexp_replace(a.guest_phone, '\D', '', 'g') from 2)
                  else regexp_replace(a.guest_phone, '\D', '', 'g') end))
  join emv_map_customer mc on mc.emv_id = c.id
  where a.customer_id is null
    and a.id not in (select emv_id from emv_map_appointment)
    and a.id not in (select emv_appt_id from emv_appt_customer)
),
best as (
  select appt_id, min(rnk) as best_rnk from cand group by appt_id
),
winners as (
  select cand.appt_id, count(distinct cand.cust_id) as n
  from cand join best on best.appt_id = cand.appt_id and cand.rnk = best.best_rnk
  group by cand.appt_id
)
insert into emv_conflicts
select 'appointment', appt_id, 'guest_match_ambiguous',
       'guest email/phone tie between ' || n || ' different customers — appointment not poured'
from winners where n > 1;
insert into emv_notices
select 'appointment', emv_appt_id, 'guest_linked',
       'guest appointment resolved to an existing customer via guest email/phone'
from emv_appt_customer where how = 'guest_matched_staging_customer';

-- guest that matches nobody: synthesize a customer from the guest fields (flagged)
with ins as (
  insert into public.customers
    (workspace_id, first_name, last_name, email, phone, country_code, status, metadata, created_at, updated_at, created_by)
  select :'workspace_id'::uuid,
         split_part(btrim(a.guest_name), ' ', 1),
         case when position(' ' in btrim(a.guest_name)) > 0
              then btrim(substr(btrim(a.guest_name), position(' ' in btrim(a.guest_name)) + 1)) else '' end,
         nullif(btrim(a.guest_email), ''),
         nullif(btrim(a.guest_phone), ''),
         'US', 'active',
         jsonb_build_object('source', 'emv_backup', 'import_batch', :'import_batch',
                            'synthesized_from_guest_appointment', a.id),
         a.created_at, a.updated_at, null
  from emv_staging.appointments a
  where a.customer_id is null
    and a.id not in (select emv_id from emv_map_appointment)
    and a.id not in (select emv_appt_id from emv_appt_customer)
  returning id, metadata ->> 'synthesized_from_guest_appointment' as emv_appt
)
insert into emv_appt_customer select emv_appt::uuid, id, 'synthesized_from_guest' from ins;
insert into emv_notices
select 'appointment', emv_appt_id, 'synthesized_from_guest',
       'guest matched no customer anywhere; a customer was created from the guest fields'
from emv_appt_customer where how = 'synthesized_from_guest';

-- appointments that could not be resolved: skip with reason
insert into emv_skips
select 'appointment', a.id,
       case when a.id in (select emv_id from emv_conflicts where entity = 'appointment')
            then 'guest_match_ambiguous'
            when a.customer_id is null then 'guest_unresolvable'
            else 'customer_not_mapped' end,
       case when a.id in (select emv_id from emv_conflicts where entity = 'appointment')
            then 'guest identity tied between customers (see conflicts); appointment not poured'
            when a.customer_id is null then 'guest appointment with no usable guest email/phone; not poured'
            else 'customer was conflict-skipped (see customer conflicts); appointment not poured' end
from emv_staging.appointments a
where a.id not in (select emv_id from emv_map_appointment)
  and a.id not in (select emv_appt_id from emv_appt_customer);

-- tenant-crossover notice (booked under another tenant of the old app;
-- the customer belongs to this workspace's book)
insert into emv_notices
select 'appointment', a.id, 'tenant_crossover',
       'booked under emv user ' || a.user_id || ' (not the source account) — poured under this workspace because its customer belongs to this book'
from emv_staging.appointments a
where a.user_id <> :'source_user_id'::uuid
  and a.id in (select emv_appt_id from emv_appt_customer);

-- 3c. insert
with ins as (
  insert into public.appointments
    (workspace_id, customer_id, vehicle_id, starts_at, ends_at, status, source,
     confirmation_code, notes, metadata, created_at, updated_at, created_by, assigned_user_id, location_id)
  select :'workspace_id'::uuid,
         ac.target_customer_id,
         mv.target_id,
         ((a.scheduled_date + a.scheduled_time) at time zone :'workspace_tz'),
         ((a.scheduled_date + a.scheduled_time) at time zone :'workspace_tz') + (a.duration_minutes || ' minutes')::interval,
         a.status::public.appointment_status,
         'emv_import',
         null,
         a.notes,
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_appointment_id', a.id,
           'emv_user_id', a.user_id,
           'emv_customer_id', a.customer_id,
           'title', a.title,
           'description', a.description,
           'emv_source', a.source,
           'emv_payment_status', a.payment_status,
           'emv_estimated_cost', a.estimated_cost,
           'emv_tax_amount', a.tax_amount,
           'emv_service_record_id', a.service_record_id,
           'emv_guest_name', a.guest_name,
           'customer_resolution', ac.how),
         a.created_at, a.updated_at, null, null, null
  from emv_staging.appointments a
  join emv_appt_customer ac on ac.emv_appt_id = a.id
  left join emv_map_vehicle mv on mv.emv_id = a.vehicle_id
  where a.id not in (select emv_id from emv_map_appointment)
  returning id, metadata ->> 'emv_appointment_id' as emv_id
)
insert into emv_map_appointment select emv_id::uuid, id, 'inserted' from ins;

-- ---------------------------------------------------------------------------
-- 4. APPOINTMENT SERVICES (30) — line items. No metadata column exists on the
--    target, so re-run protection is a predicate match (appointment + name +
--    price + description). service_catalog_id -> NULL (different identity
--    space; prod catalog is canonical and separately governed).
-- ---------------------------------------------------------------------------
create temp table emv_asvc_done (emv_id uuid primary key, action text not null);
create temp table emv_asvc_counts (inserted integer not null default 0);
insert into emv_asvc_counts values (0);
insert into emv_asvc_done
select s.id, 'linked_existing'
from emv_staging.appointment_services s
join emv_map_appointment ma on ma.emv_id = s.appointment_id
join public.appointment_services x
  on x.appointment_id = ma.target_id
 and x.name = s.name
 and x.price = s.price
 and coalesce(x.description, '') = coalesce(s.description, '');
with ins as (
  insert into public.appointment_services
    (id, appointment_id, service_catalog_id, name, description, price, quantity,
     is_prepaid, added_at_service, vehicle_id, created_at, updated_at)
  select gen_random_uuid(),
         ma.target_id,
         null,
         s.name, s.description, s.price, s.quantity,
         s.is_prepaid, s.added_at_service,
         mv.target_id,
         s.created_at, s.updated_at
  from emv_staging.appointment_services s
  join emv_map_appointment ma on ma.emv_id = s.appointment_id
  left join emv_staging.appointments a on a.id = s.appointment_id
  left join emv_map_vehicle mv on mv.emv_id = a.vehicle_id
  where s.id not in (select emv_id from emv_asvc_done)
  returning id
)
update emv_asvc_counts set inserted = (select count(*) from ins);
insert into emv_asvc_done
select s.id, 'inserted'
from emv_staging.appointment_services s
join emv_map_appointment ma on ma.emv_id = s.appointment_id
join public.appointment_services x
  on x.appointment_id = ma.target_id
 and x.name = s.name
 and x.price = s.price
 and coalesce(x.description, '') = coalesce(s.description, '')
where s.id not in (select emv_id from emv_asvc_done);
insert into emv_skips
select 'appointment_service', s.id, 'appointment_not_poured',
       'parent appointment was skipped/conflicted; line not poured'
from emv_staging.appointment_services s
where s.appointment_id not in (select emv_id from emv_map_appointment)
  and s.id not in (select emv_id from emv_asvc_done);

-- ---------------------------------------------------------------------------
-- 5. SERVICE RECORDS (155) — from emv `services`, the old job-history table.
--    Contested-shape discipline: only columns whose existence is corroborated
--    by BOTH the generated prod types and the addendum's settled reads are
--    written; everything else rides in metadata.
-- ---------------------------------------------------------------------------
insert into emv_map_service
select s.id, t.id, 'linked_provenance'
from emv_staging.services s
join public.service_records t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_service_id' = s.id::text;

insert into emv_skips
select 'service_record', s.id, 'customer_not_mapped',
       'customer was conflict-skipped; service record not poured'
from emv_staging.services s
where s.id not in (select emv_id from emv_map_service)
  and s.customer_id not in (select emv_id from emv_map_customer);

-- a record whose appointment did not pour still pours, unlinked — say so
insert into emv_notices
select 'service_record', s.id, 'appointment_not_poured_record_unlinked',
       'service record poured with appointment_id NULL because its appointment (' || s.appointment_id || ') was skipped/conflicted'
from emv_staging.services s
where s.appointment_id is not null
  and s.appointment_id not in (select emv_id from emv_map_appointment)
  and s.customer_id in (select emv_id from emv_map_customer);

with ins as (
  insert into public.service_records
    (workspace_id, appointment_id, customer_id, vehicle_id, work_order_id, quote_id,
     status, work_performed, subtotal, tax_amount, tax_rate, discount_amount,
     total_amount, currency_code, completed_at, oil_quarts_used,
     metadata, created_at, updated_at)
  select :'workspace_id'::uuid,
         ma.target_id,
         mc.target_id,
         mv.target_id,
         null, null,
         'completed',
         s.description,
         s.total_cost - coalesce(s.tax_amount, 0),
         s.tax_amount,
         s.tax_rate,
         s.discount_amount,
         s.total_cost,
         'USD',
         (s.service_date::timestamp at time zone :'workspace_tz'),
         s.oil_quarts_used,
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_service_id', s.id,
           'emv_service_number', s.service_number,
           'emv_service_type', s.service_type,
           'emv_payment_status', s.payment_status,
           'emv_paid_amount', s.paid_amount,
           'emv_parts_used', s.parts_used,
           'emv_labor_hours', s.labor_hours,
           'emv_labor_cost', s.labor_cost,
           'emv_parts_cost', s.parts_cost,
           'emv_shop_supplies', s.shop_supplies,
           'emv_technician', s.technician),
         s.created_at, s.updated_at
  from emv_staging.services s
  join emv_map_customer mc on mc.emv_id = s.customer_id
  left join emv_map_appointment ma on ma.emv_id = s.appointment_id
  left join emv_map_vehicle mv on mv.emv_id = s.vehicle_id
  where s.id not in (select emv_id from emv_map_service)
    and s.id not in (select emv_id from emv_skips where entity = 'service_record')
  returning id, metadata ->> 'emv_service_id' as emv_id
)
insert into emv_map_service select emv_id::uuid, id, 'inserted' from ins;

-- ---------------------------------------------------------------------------
-- 6. INVOICES (synthesized — one per poured service record; the old system
--    issued none, and prod payments must hang on an invoice).
--    Numbers self-source: target MAX + row_number, in-transaction.
-- ---------------------------------------------------------------------------
insert into emv_map_invoice
select s.id, t.id, 'linked_provenance'
from emv_staging.services s
join public.invoices t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_service_id' = s.id::text;

with base as (
  select coalesce(max(invoice_number), 0) as b from public.invoices
),
numbered as (
  select s.id as emv_service_id,
         row_number() over (order by s.service_date, s.service_number) as rn
  from emv_staging.services s
  where s.id in (select emv_id from emv_map_service)
    and s.id not in (select emv_service_id from emv_map_invoice)
),
paid_pr as (
  select appointment_id, sum(amount) / 100.0 as dollars
  from emv_staging.payment_records
  where status = 'succeeded' and appointment_id is not null
  group by appointment_id
),
ins as (
  insert into public.invoices
    (workspace_id, customer_id, vehicle_id, work_order_id, invoice_number,
     status, subtotal, tax_total, total, amount_paid, issued_at, due_at,
     metadata, created_at, updated_at, created_by)
  select :'workspace_id'::uuid,
         mc.target_id,
         mv.target_id,
         null,
         (select b from base) + n.rn,
         (case
           when s.total_cost > 0 and
                (case when s.payment_status = 'paid' then s.total_cost
                      else least(s.total_cost, coalesce(p.dollars, 0)) end) >= s.total_cost
             then 'paid'
           when (case when s.payment_status = 'paid' then s.total_cost
                      else least(s.total_cost, coalesce(p.dollars, 0)) end) > 0
             then 'partially_paid'
           else 'issued'
         end)::public.invoice_status,
         s.total_cost - coalesce(s.tax_amount, 0),
         coalesce(s.tax_amount, 0),
         s.total_cost,
         case when s.payment_status = 'paid' then s.total_cost
              else least(s.total_cost, coalesce(p.dollars, 0)) end,
         (s.service_date::timestamp at time zone :'workspace_tz'),
         null,
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_service_id', s.id,
           'emv_service_number', s.service_number,
           'emv_appointment_id', s.appointment_id,
           'synthesized_for_emv_import', true),
         s.created_at, s.updated_at, null
  from emv_staging.services s
  join numbered n on n.emv_service_id = s.id
  join emv_map_customer mc on mc.emv_id = s.customer_id
  left join emv_map_vehicle mv on mv.emv_id = s.vehicle_id
  left join paid_pr p on p.appointment_id = s.appointment_id
  returning id, metadata ->> 'emv_service_id' as emv_service_id
)
insert into emv_map_invoice select emv_service_id::uuid, id, 'inserted' from ins;

-- ---------------------------------------------------------------------------
-- 7. PAYMENTS — only the 11 SUCCEEDED payment_records (manual records; no
--    provider was involved, so provider/provider_payment_id stay NULL and
--    the method rides in metadata). Pending records never moved money.
-- ---------------------------------------------------------------------------
insert into emv_map_payment
select pr.id, t.id, 'linked_provenance'
from emv_staging.payment_records pr
join public.payments t
  on t.workspace_id = :'workspace_id'::uuid
 and t.metadata ->> 'emv_payment_record_id' = pr.id::text;

insert into emv_skips
select 'payment_record', pr.id,
       case when pr.status <> 'succeeded' then 'not_succeeded_no_money_moved' else 'chain_not_poured' end,
       case when pr.status <> 'succeeded'
            then 'status=' || pr.status || ' type=' || pr.payment_type || ' amount_cents=' || pr.amount ||
                 ' email=' || coalesce(pr.customer_email, '-') || ' — never moved money; not a payment'
            else 'succeeded but its appointment/service/invoice chain was not poured — see above skips' end
from emv_staging.payment_records pr
where pr.id not in (select emv_id from emv_map_payment)
  and not (pr.status = 'succeeded'
           and pr.appointment_id in (select emv_id from emv_map_appointment)
           and exists (select 1 from emv_staging.services s
                       join emv_map_invoice mi on mi.emv_service_id = s.id
                       where s.appointment_id = pr.appointment_id));

with ins as (
  insert into public.payments
    (workspace_id, invoice_id, customer_id, provider, provider_payment_id,
     status, amount, currency_code, paid_at, metadata, created_at, updated_at, created_by)
  select :'workspace_id'::uuid,
         mi.target_id,
         mc.target_id,
         null, null,
         'succeeded',
         pr.amount / 100.0,
         'USD',
         pr.created_at,
         jsonb_build_object(
           'source', 'emv_backup',
           'import_batch', :'import_batch',
           'emv_payment_record_id', pr.id,
           'emv_payment_type', pr.payment_type,
           'emv_payment_method', pr.metadata ->> 'payment_method',
           'emv_manual_payment', pr.metadata ->> 'manual_payment',
           'emv_recorded_by', pr.metadata ->> 'recorded_by',
           'emv_platform_fee_cents', pr.platform_fee,
           'emv_stripe_connected_account_id', pr.stripe_connected_account_id),
         pr.created_at, pr.updated_at, null
  from emv_staging.payment_records pr
  join emv_map_appointment ma on ma.emv_id = pr.appointment_id
  join emv_staging.appointments a on a.id = pr.appointment_id
  join emv_map_customer mc on mc.emv_id = a.customer_id
  join emv_staging.services s on s.appointment_id = pr.appointment_id
  join emv_map_invoice mi on mi.emv_service_id = s.id
  where pr.status = 'succeeded'
    and pr.id not in (select emv_id from emv_map_payment)
  returning id, metadata ->> 'emv_payment_record_id' as emv_id
)
insert into emv_map_payment select emv_id::uuid, id, 'inserted' from ins;

-- a poured payment can exceed its synthesized invoice's total when the source
-- itself disagrees (a $0 service row with a real payment on its appointment).
-- The payment row carries the truth; surface the disagreement, never hide it.
insert into emv_notices
select 'invoice', mi.emv_service_id, 'payment_exceeds_invoice_total',
       'poured payments sum $' || to_char(ps.sum_amt, 'FM999999990.00') ||
       ' exceeds the synthesized invoice total $' || to_char(i.total, 'FM999999990.00') ||
       ' (the source service row carries total_cost ' || i.total || ' while its appointment has a succeeded payment record) — invoice amount_paid left at the record-based value; the payment row is the money truth'
from emv_map_invoice mi
join public.invoices i on i.id = mi.target_id
join (select invoice_id, sum(amount) as sum_amt from public.payments
      where id in (select target_id from emv_map_payment) group by invoice_id) ps
  on ps.invoice_id = i.id
where ps.sum_amt > i.total;

-- financial_transactions: exact mirrors of the succeeded payment_records —
-- pouring them would double-count the same money. Listed, never poured.
insert into emv_skips
select 'financial_transaction', ft.id, 'mirror_of_payment_record',
       'mirrors payment_record ' || ft.payment_record_id || ' (gross ' || ft.gross_amount ||
       ' vs record $' || to_char(pr.amount / 100.0, 'FM999999990.00') || ') — the payment_record pour covers this money'
from emv_staging.financial_transactions ft
join emv_staging.payment_records pr on pr.id = ft.payment_record_id;

-- ---------------------------------------------------------------------------
-- 8. SPECS -> ARCHIVE ONLY (13,996). Never the live table.
-- ---------------------------------------------------------------------------
insert into public.emv_archive_vehicle_specifications
  (id, workspace_id, year, make, model, engine, oil_type, oil_capacity,
   air_filter, oil_filter, cabin_filter, fuel_filter,
   wiper_blade_driver, wiper_blade_passenger, wiper_blade_rear,
   transmission_fluid, coolant_type, brake_fluid, tire_size,
   additional_specs, source, created_at, updated_at, import_batch)
select id, :'workspace_id'::uuid, year, make, model, engine, oil_type, oil_capacity,
       air_filter, oil_filter, cabin_filter, fuel_filter,
       wiper_blade_driver, wiper_blade_passenger, wiper_blade_rear,
       transmission_fluid, coolant_type, brake_fluid, tire_size,
       additional_specs, source, created_at, updated_at, :'import_batch'
from emv_staging.vehicle_specifications
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 9. FLEET (2 clients, contacts) — present prod tables, thin mapping.
-- ---------------------------------------------------------------------------
insert into emv_map_fleet
select f.id, t.id, 'linked_email'
from emv_staging.fleet_clients f
join public.fleet_clients t
  on t.workspace_id = :'workspace_id'::uuid
 and nullif(lower(btrim(t.billing_email)), '') = nullif(lower(btrim(f.billing_email)), '')
where f.billing_email is not null;
insert into emv_map_fleet
select f.id, t.id, 'linked_name'
from emv_staging.fleet_clients f
join public.fleet_clients t
  on t.workspace_id = :'workspace_id'::uuid
 and lower(t.name) = lower(f.company_name)
where f.id not in (select emv_id from emv_map_fleet);

with ins as (
  insert into public.fleet_clients
    (workspace_id, name, billing_email, phone, account_number, billing_terms_days,
     is_active, lifecycle_stage, created_at, updated_at)
  select :'workspace_id'::uuid,
         f.company_name, f.billing_email, f.phone, null,
         case when f.payment_terms ~ '^net_(\d+)$'
              then (regexp_match(f.payment_terms, '^net_(\d+)$'))[1]::int else 30 end,
         (f.status = 'active'), 'active',
         f.created_at, f.updated_at
  from emv_staging.fleet_clients f
  where f.id not in (select emv_id from emv_map_fleet)
  returning id, billing_email, name
)
insert into emv_map_fleet
select f.id, i.id, 'inserted'
from ins i
join emv_staging.fleet_clients f
  on nullif(lower(btrim(f.billing_email)), '') = nullif(lower(btrim(i.billing_email)), '');
-- a client with no billing email anywhere would stay unmapped; record it
insert into emv_skips
select 'fleet_client', f.id, 'unmapped_after_insert',
       'fleet client could not be mapped back after insert (no billing email key) — check manually'
from emv_staging.fleet_clients f
where f.id not in (select emv_id from emv_map_fleet);

-- contacts: the staging contact rows, deduped by (client, email)
create temp table emv_contact_done (n integer);
with ins as (
  insert into public.fleet_client_contacts
    (workspace_id, fleet_client_id, name, email, phone, is_primary, created_at, updated_at)
  select :'workspace_id'::uuid, mf.target_id, fc.name, fc.email, fc.phone,
         coalesce(fc.is_primary, false), fc.created_at, fc.updated_at
  from emv_staging.fleet_contacts fc
  join emv_map_fleet mf on mf.emv_id = fc.fleet_client_id
  where not exists (
    select 1 from public.fleet_client_contacts x
    where x.fleet_client_id = mf.target_id
      and nullif(lower(btrim(x.email)), '') = nullif(lower(btrim(fc.email)), ''))
  returning id
)
insert into emv_contact_done select count(*) from ins;

insert into emv_notices
select 'fleet_client', f.id, 'fields_without_prod_columns',
       'emv fleet client fields with no prod columns (address block, contract dates, monthly_vehicle_count, region, fleet-manager fields, invoice_format, portal/intake settings) were not carried — they remain in the backup'
from emv_staging.fleet_clients f;

-- ---------------------------------------------------------------------------
-- 10. SKIPPED-BY-DESIGN source tables (present in staging, deliberately not
--     poured) — recorded so the report accounts for every staged table.
-- ---------------------------------------------------------------------------
insert into emv_skips (entity, emv_id, reason, detail) values
  ('business_profiles', null, 'tenant_config_of_dead_app', '6 profiles incl. 5 other tenants; the MOMS workspace already exists in prod with its own settings'),
  ('service_catalog', null, 'prod_catalog_canonical', '23 emv catalog rows (with cross-tenant duplicates); prod catalog is canonical under the price-lock — not overwritten'),
  ('tax_rates', null, 'config_lives_in_workspace_settings', '45 emv tax rows; prod tax config is workspace_settings'),
  ('maintenance_schedules', null, 'deferred_due_service_design', '52 rows; SW interval design is a deferred phase decision (reconciliation addendum bucket iii)'),
  ('customer_accounts', null, 'portal_logins_not_customer_book', '11 portal accounts; 9 duplicate customer emails, 2 match no customer (djoreally@gmail.com; megan.olivera@icloud.com — a name that exists nowhere else)'),
  ('email_queue', null, 'operational_exhaust', '80 rows of sent/queued mail from the dead app'),
  ('in_app_notifications', null, 'operational_exhaust', '78 rows'),
  ('inventory_items', null, 'no_prod_counterpart_in_scope', '16 rows; inventory depth is a later phase'),
  ('subscription_plans', null, 'dead_app_billing_config', '42 rows of the old app plan config'),
  ('vehicle_specs_cache+vin_decode_cache', null, 'superseded_caches', '9 cache rows; QLD/vPIC serve this now'),
  ('financial_transactions_unit_backup_20260316', null, 'source_internal_backup_table', '7 rows; a 2026-03-16 backup table inside the source itself');

-- ---------------------------------------------------------------------------
-- 11. REPORT
-- ---------------------------------------------------------------------------
insert into emv_rep(line)
select '--- CUSTOMERS: source=' || (select count(*) from emv_staging.customers)
    || ' linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' linked_email=' || count(*) filter (where action = 'linked_email')
    || ' linked_phone=' || count(*) filter (where action = 'linked_phone')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' conflicts=' || (select count(*) from emv_conflicts where entity = 'customer')
from emv_map_customer;
insert into emv_rep(line)
select '--- VEHICLES: source=' || (select count(*) from emv_staging.vehicles)
    || ' linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' linked_vin=' || count(*) filter (where action = 'linked_vin')
    || ' linked_ymm=' || count(*) filter (where action = 'linked_ymm')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' conflicts=' || (select count(*) from emv_conflicts where entity = 'vehicle')
    || ' skips=' || (select count(*) from emv_skips where entity = 'vehicle')
from emv_map_vehicle;
insert into emv_rep(line)
select '--- APPOINTMENTS: source=' || (select count(*) from emv_staging.appointments)
    || ' linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' skips=' || (select count(*) from emv_skips where entity = 'appointment')
from emv_map_appointment;
insert into emv_rep(line)
select '--- APPOINTMENT_SERVICES: source=' || (select count(*) from emv_staging.appointment_services)
    || ' linked_existing=' || (select count(*) from emv_asvc_done where action = 'linked_existing')
    || ' inserted=' || (select inserted from emv_asvc_counts)
    || ' skips=' || (select count(*) from emv_skips where entity = 'appointment_service')
    || ' field_skip: service_catalog_id set NULL on all poured lines (prod catalog identity space differs)';
insert into emv_rep(line)
select '--- SERVICE_RECORDS: source=' || (select count(*) from emv_staging.services)
    || ' linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' skips=' || (select count(*) from emv_skips where entity = 'service_record')
from emv_map_service;
insert into emv_rep(line)
select '--- INVOICES (synthesized): linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' total_poured=$' || to_char(coalesce(sum(t.total), 0), 'FM999999990.00')
    || ' amount_paid_poured=$' || to_char(coalesce(sum(t.amount_paid), 0), 'FM999999990.00')
from emv_map_invoice mi join public.invoices t on t.id = mi.target_id;
insert into emv_rep(line)
select '--- PAYMENTS: source_records=' || (select count(*) from emv_staging.payment_records)
    || ' linked_provenance=' || count(*) filter (where action = 'linked_provenance')
    || ' inserted=' || count(*) filter (where action = 'inserted')
    || ' skipped=' || (select count(*) from emv_skips where entity = 'payment_record')
from emv_map_payment;
insert into emv_rep(line)
select '--- SPECS->ARCHIVE: source=' || (select count(*) from emv_staging.vehicle_specifications)
    || ' archived_total_for_batch=' || (select count(*) from public.emv_archive_vehicle_specifications where import_batch = :'import_batch')
    || ' (archive table; NOT the live spec source)';
insert into emv_rep(line)
select '--- FLEET: clients source=' || (select count(*) from emv_staging.fleet_clients)
    || ' mapped=' || (select count(*) from emv_map_fleet)
    || ' contacts_in_target=' || (select count(*) from public.fleet_client_contacts x
         where x.fleet_client_id in (select target_id from emv_map_fleet));
insert into emv_rep(line)
select '--- CROSS-CHECKS:';
insert into emv_rep(line)
select '    payments: succeeded source sum=$' || to_char((select coalesce(sum(amount), 0) from emv_staging.payment_records where status = 'succeeded') / 100.0, 'FM999999990.00')
    || ' | poured payments sum=$' || to_char(coalesce((select sum(p.amount) from public.payments p
         where p.id in (select target_id from emv_map_payment)), 0), 'FM999999990.00');
insert into emv_rep(line)
select '    service money: source services total_cost sum=$' || to_char((select coalesce(sum(total_cost), 0) from emv_staging.services), 'FM999999990.00')
    || ' | poured service_records total sum=$' || to_char(coalesce((select sum(sr.total_amount) from public.service_records sr
         where sr.id in (select target_id from emv_map_service)), 0), 'FM999999990.00');
insert into emv_rep(line)
select '    appointments accounted: mapped+skipped=' ||
       ((select count(*) from emv_map_appointment) + (select count(*) from emv_skips where entity = 'appointment'))
    || ' of source ' || (select count(*) from emv_staging.appointments);
insert into emv_rep(line) select '--- CONFLICTS (never merged, dependents skipped):';
insert into emv_rep(line)
select '    [' || entity || '] ' || coalesce(emv_id::text, '-') || ' — ' || reason || ' — ' || detail
from emv_conflicts order by entity, reason;
insert into emv_rep(line) select '--- SKIPS (with reasons):';
insert into emv_rep(line)
select '    [' || entity || '] ' || coalesce(emv_id::text, '(table)') || ' — ' || reason || ' — ' || detail
from emv_skips order by entity, reason;
insert into emv_rep(line) select '--- NOTICES:';
insert into emv_rep(line)
select '    [' || entity || '] ' || coalesce(emv_id::text, '-') || ' — ' || notice || ' — ' || detail
from emv_notices order by entity, notice;
insert into emv_rep(line) select '--- END OF REPORT';

select line from emv_rep order by seq;
