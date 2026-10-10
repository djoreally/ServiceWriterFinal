-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.log_cash_drawer_event(p_amount numeric DEFAULT NULL, p_appointment_id text DEFAULT NULL, p_event_type text, p_payment_id text DEFAULT NULL, p_payment_method text DEFAULT NULL, p_reason text DEFAULT NULL, p_trigger_type text) RETURNS text
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_cash_drawer_event'
  ) THEN
    CREATE FUNCTION public.log_cash_drawer_event(p_amount numeric DEFAULT NULL, p_appointment_id text DEFAULT NULL, p_event_type text, p_payment_id text DEFAULT NULL, p_payment_method text DEFAULT NULL, p_reason text DEFAULT NULL, p_trigger_type text)
    RETURNS text
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'log_cash_drawer_event';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.log_cash_drawer_event already exists, stub not installed';
  END IF;
END
$do$;
