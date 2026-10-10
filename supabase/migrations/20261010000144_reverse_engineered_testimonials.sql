-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.testimonials
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.testimonials (
  content text,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_email text,
  customer_id uuid,
  customer_name text NOT NULL,
  deleted_at timestamptz,
  featured boolean,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_replied_at timestamptz,
  provider_reply text,
  rating numeric,
  service_id uuid,
  status text NOT NULL,
  submission_token text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  video_url text
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='testimonials' AND policyname='testimonials_re_owner_all') THEN
  CREATE POLICY testimonials_re_owner_all ON public.testimonials FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'testimonials_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK testimonials_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'testimonials_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK testimonials_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
