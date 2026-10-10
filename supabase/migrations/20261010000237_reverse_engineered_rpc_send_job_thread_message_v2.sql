-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- RPC: public.send_job_thread_message_v2(p_attachments jsonb DEFAULT NULL, p_channel text DEFAULT NULL, p_client_message_id text DEFAULT NULL, p_content text, p_job_id text, p_job_source text, p_recipient text DEFAULT NULL) RETURNS jsonb
-- Source of signature: src/integrations/supabase/types.ts (generated DB types)
-- Body is a STUB: installed only if no function with this name exists in production.
-- It raises a clear exception so a missing production definition fails loudly, never silently.
-- Replace with the production definition (see PROD_DB_EXPORT_GUIDE.md).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'send_job_thread_message_v2'
  ) THEN
    CREATE FUNCTION public.send_job_thread_message_v2(p_attachments jsonb DEFAULT NULL, p_channel text DEFAULT NULL, p_client_message_id text DEFAULT NULL, p_content text, p_job_id text, p_job_source text, p_recipient text DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RAISE EXCEPTION 'reverse-engineered stub -- replace with production definition (%)', 'send_job_thread_message_v2';
    END;
    $func$;
  ELSE
    RAISE NOTICE 'reverse-engineered migration: function public.send_job_thread_message_v2 already exists, stub not installed';
  END IF;
END
$do$;
