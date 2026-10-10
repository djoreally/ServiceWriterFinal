-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.record_inventory_movement_v1(p_entry_type text, p_idempotency_key text, p_job_id text DEFAULT NULL, p_job_source text DEFAULT NULL, p_note text DEFAULT NULL, p_quantity numeric, p_van_inventory_id text) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_inventory_movement_v1'
  ) THEN
    CREATE FUNCTION public.record_inventory_movement_v1(p_entry_type text, p_idempotency_key text, p_job_id text DEFAULT NULL, p_job_source text DEFAULT NULL, p_note text DEFAULT NULL, p_quantity numeric, p_van_inventory_id text)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'record_inventory_movement_v1';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.record_inventory_movement_v1 already exists, stub not installed';
  END IF;
END
$do$;
