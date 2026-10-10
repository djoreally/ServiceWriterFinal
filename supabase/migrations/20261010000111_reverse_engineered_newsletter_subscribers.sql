-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.newsletter_subscribers
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  consent_at timestamptz,
  consent_ip text,
  consent_user_agent text,
  customer_id uuid,
  deleted_at timestamptz,
  email text NOT NULL,
  email_normalized text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preferences jsonb NOT NULL,
  segment text NOT NULL,
  source text NOT NULL,
  status text,
  subscribed_at timestamptz,
  subscriber_name text,
  unsubscribe_token text NOT NULL,
  unsubscribed_at timestamptz,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  utm jsonb NOT NULL
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='newsletter_subscribers' AND policyname='newsletter_subscribers_re_owner_all') THEN
  CREATE POLICY newsletter_subscribers_re_owner_all ON public.newsletter_subscribers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_subscribers_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK newsletter_subscribers_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
