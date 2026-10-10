-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.ensure_job_thread(p_created_by text, p_job_id text, p_job_source text) RETURNS text
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_job_thread'
  ) THEN
    CREATE FUNCTION public.ensure_job_thread(p_created_by text, p_job_id text, p_job_source text)
    RETURNS text
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'ensure_job_thread';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.ensure_job_thread already exists, stub not installed';
  END IF;
END
$do$;
