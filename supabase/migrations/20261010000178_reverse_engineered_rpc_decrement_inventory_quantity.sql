-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.decrement_inventory_quantity(p_item_id text, p_quantity numeric) RETURNS numeric
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'decrement_inventory_quantity'
  ) THEN
    CREATE FUNCTION public.decrement_inventory_quantity(p_item_id text, p_quantity numeric)
    RETURNS numeric
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'decrement_inventory_quantity';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.decrement_inventory_quantity already exists, stub not installed';
  END IF;
END
$do$;
