-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.get_provider_rewards_ledger(p_appointment_id text DEFAULT NULL, p_customer_id text DEFAULT NULL, p_event_type text DEFAULT NULL, p_from text DEFAULT NULL, p_limit numeric DEFAULT NULL, p_offset numeric DEFAULT NULL, p_provider_id text, p_to text DEFAULT NULL) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_provider_rewards_ledger'
  ) THEN
    CREATE FUNCTION public.get_provider_rewards_ledger(p_appointment_id text DEFAULT NULL, p_customer_id text DEFAULT NULL, p_event_type text DEFAULT NULL, p_from text DEFAULT NULL, p_limit numeric DEFAULT NULL, p_offset numeric DEFAULT NULL, p_provider_id text, p_to text DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'get_provider_rewards_ledger';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.get_provider_rewards_ledger already exists, stub not installed';
  END IF;
END
$do$;
