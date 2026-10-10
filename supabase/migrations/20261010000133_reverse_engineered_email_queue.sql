-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.email_queue
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.email_queue (
  appointment_id uuid,
  campaign_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  email_type text NOT NULL,
  error_message text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_event text,
  last_event_at timestamptz,
  metadata jsonb,
  priority numeric NOT NULL,
  provider_message_id uuid,
  recipient_email text NOT NULL,
  recipient_name text,
  retry_count numeric NOT NULL,
  review_request_id uuid,
  scheduled_for text NOT NULL,
  sent_at timestamptz,
  service_id uuid,
  source text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_queue' AND policyname='email_queue_re_owner_all') THEN
  CREATE POLICY email_queue_re_owner_all ON public.email_queue FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_queue_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK email_queue_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_queue_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK email_queue_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_queue_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK email_queue_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
