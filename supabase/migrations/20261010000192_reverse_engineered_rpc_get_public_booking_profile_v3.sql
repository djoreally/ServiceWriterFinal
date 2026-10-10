-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.get_public_booking_profile_v3(booking_slug_param text) RETURNS jsonb
-- Source of signature: call site: platform.ts:753 supabase.rpc(name, { booking_slug_param: slug }); returns array, data[0] used
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_public_booking_profile_v3'
  ) THEN
    CREATE FUNCTION public.get_public_booking_profile_v3(booking_slug_param text)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'get_public_booking_profile_v3';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.get_public_booking_profile_v3 already exists, stub not installed';
  END IF;
END
$do$;
