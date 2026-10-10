-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.create_fleet_job_for_work_orders_v1(p_notes text DEFAULT NULL, p_work_order_ids text) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_fleet_job_for_work_orders_v1'
  ) THEN
    CREATE FUNCTION public.create_fleet_job_for_work_orders_v1(p_notes text DEFAULT NULL, p_work_order_ids text)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'create_fleet_job_for_work_orders_v1';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.create_fleet_job_for_work_orders_v1 already exists, stub not installed';
  END IF;
END
$do$;
