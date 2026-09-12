-- Shot 23 production-safe adversarial verification plan.
-- Run after applying Shots 15-22 in a disposable/staging database transaction.
-- This file is intentionally assertion/read focused and does not mutate production.

-- 1. Browser roles must not read token digests.
select
  has_table_privilege('anon','public.appointment_management_tokens','select') as anon_reads_tokens,
  has_table_privilege('authenticated','public.appointment_management_tokens','select') as authenticated_reads_tokens;

-- Expected: false / false.

-- 2. Legacy plaintext token metadata must be gone.
select count(*) as plaintext_token_rows
from public.appointments
where metadata ? 'management_token';

-- Expected: 0.

-- 3. Legacy trigger/function must be absent.
select count(*) as legacy_generator_functions
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='ensure_appointment_management_token_v1';

-- Expected: 0.

-- 4. Public bearer functions remain callable only through exact allowlisted signatures.
select
  has_function_privilege('anon','public.cancel_appointment_by_token(text,text)','execute') as anon_cancel,
  has_function_privilege('anon','public.reschedule_appointment_by_token(text,date,time without time zone)','execute') as anon_reschedule;

-- Expected: true / true until public-link UI is migrated behind a server API.

-- 5. Portal functions must not be anonymous.
select
  has_function_privilege('anon','public.cancel_customer_portal_appointment_v1(uuid,text)','execute') as anon_portal_cancel,
  has_function_privilege('anon','public.reschedule_customer_portal_appointment_v1(uuid,date,time without time zone)','execute') as anon_portal_reschedule;

-- Expected: false / false.
