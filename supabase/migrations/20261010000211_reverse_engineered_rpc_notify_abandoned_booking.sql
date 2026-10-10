-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.notify_abandoned_booking(row_id text) RETURNS void
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'notify_abandoned_booking'
  ) THEN
    CREATE FUNCTION public.notify_abandoned_booking(row_id text)
    RETURNS void
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'notify_abandoned_booking';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.notify_abandoned_booking already exists, stub not installed';
  END IF;
END
$do$;
