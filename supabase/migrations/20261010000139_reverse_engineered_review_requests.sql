-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.review_requests
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.review_requests (
  channel text,
  clicked_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  deleted_at timestamptz,
  email_queue_id uuid,
  error_message text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  review_url_clicked_at timestamptz,
  send_at timestamptz,
  sent_at timestamptz,
  service_id uuid,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='review_requests' AND policyname='review_requests_re_owner_all') THEN
  CREATE POLICY review_requests_re_owner_all ON public.review_requests FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_requests_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK review_requests_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_requests_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK review_requests_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
