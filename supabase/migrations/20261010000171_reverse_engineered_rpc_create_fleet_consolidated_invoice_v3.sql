-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.create_fleet_consolidated_invoice_v3(_invoice_number text DEFAULT NULL, _notes text DEFAULT NULL, _processing_fee_enabled boolean DEFAULT NULL, _processing_fee_type text DEFAULT NULL, _processing_fee_value numeric DEFAULT NULL, _tax_enabled boolean DEFAULT NULL, _tax_rate numeric DEFAULT NULL, _work_order_ids text) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_fleet_consolidated_invoice_v3'
  ) THEN
    CREATE FUNCTION public.create_fleet_consolidated_invoice_v3(_invoice_number text DEFAULT NULL, _notes text DEFAULT NULL, _processing_fee_enabled boolean DEFAULT NULL, _processing_fee_type text DEFAULT NULL, _processing_fee_value numeric DEFAULT NULL, _tax_enabled boolean DEFAULT NULL, _tax_rate numeric DEFAULT NULL, _work_order_ids text)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'create_fleet_consolidated_invoice_v3';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.create_fleet_consolidated_invoice_v3 already exists, stub not installed';
  END IF;
END
$do$;
