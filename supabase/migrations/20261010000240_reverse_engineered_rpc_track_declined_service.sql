-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.track_declined_service(p_appointment_id text DEFAULT NULL, p_catalog_item_id text DEFAULT NULL, p_customer_id text, p_decline_reason text DEFAULT NULL, p_estimated_cost numeric, p_notes text DEFAULT NULL, p_recommended_service text, p_urgency text DEFAULT NULL, p_vehicle_id text) RETURNS text
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'track_declined_service'
  ) THEN
    CREATE FUNCTION public.track_declined_service(p_appointment_id text DEFAULT NULL, p_catalog_item_id text DEFAULT NULL, p_customer_id text, p_decline_reason text DEFAULT NULL, p_estimated_cost numeric, p_notes text DEFAULT NULL, p_recommended_service text, p_urgency text DEFAULT NULL, p_vehicle_id text)
    RETURNS text
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'track_declined_service';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.track_declined_service already exists, stub not installed';
  END IF;
END
$do$;
