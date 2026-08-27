-- Service Writer post-migration verification. Run after applying
-- 20260827100000_secure_public_booking_rpc_context.sql.

select json_build_object(
  'migration_recorded', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827100000'
  ),
  'public_booking_functions', (
    select count(*) = 8
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'resolve_public_booking_context',
        'public_booking_upsert_customer',
        'public_booking_upsert_vehicle',
        'public_booking_book_appointment',
        'public_booking_save_configuration',
        'public_booking_insert_services',
        'public_booking_record_payment_intent_v2',
        'public_booking_set_vehicle_tire_spec_v2'
      )
  ),
  'secure_search_path_count', (
    select count(*) = 8
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'resolve_public_booking_context',
        'public_booking_upsert_customer',
        'public_booking_upsert_vehicle',
        'public_booking_book_appointment',
        'public_booking_save_configuration',
        'public_booking_insert_services',
        'public_booking_record_payment_intent_v2',
        'public_booking_set_vehicle_tire_spec_v2'
      )
      and p.proconfig @> array['search_path=pg_catalog, public']
  ),
  'all_public_booking_functions_security_definer', (
    select count(*) = 8
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'resolve_public_booking_context',
        'public_booking_upsert_customer',
        'public_booking_upsert_vehicle',
        'public_booking_book_appointment',
        'public_booking_save_configuration',
        'public_booking_insert_services',
        'public_booking_record_payment_intent_v2',
        'public_booking_set_vehicle_tire_spec_v2'
      )
      and p.prosecdef
  ),
  'legacy_browser_grants_revoked', (
    has_function_privilege('anon', 'public.upsert_customer(uuid,text,text,text,text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.upsert_customer(uuid,text,text,text,text)', 'execute') = false
    and has_function_privilege('anon', 'public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text)', 'execute') = false
  ),
  'new_browser_grants_present', (
    has_function_privilege('anon', 'public.public_booking_upsert_customer(text,text,text,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.public_booking_upsert_customer(text,text,text,text,text)', 'execute')
  )
) as verification;

-- Expected adversarial checks on the intended project, using a real test fixture:
-- 1. A valid slug must resolve only its own workspace.
-- 2. A valid slug plus another tenant's appointment must raise INVALID_APPOINTMENT.
-- 3. A valid slug plus another tenant's vehicle must raise INVALID_VEHICLE.
-- 4. An unknown or disabled slug must raise BOOKING_CONTEXT_INVALID.
-- 5. Repeating the same public booking request must not cross tenant boundaries.
