-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.lookup_vehicle_parts(p_make text, p_model text, p_year numeric) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lookup_vehicle_parts'
  ) THEN
    CREATE FUNCTION public.lookup_vehicle_parts(p_make text, p_model text, p_year numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'lookup_vehicle_parts';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.lookup_vehicle_parts already exists, stub not installed';
  END IF;
END
$do$;
