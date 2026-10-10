-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.customer_accounts
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  email text NOT NULL,
  full_name text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  provider_id uuid,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_accounts' AND policyname='customer_accounts_re_owner_all') THEN
  CREATE POLICY customer_accounts_re_owner_all ON public.customer_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_accounts_provider_id_fkey') THEN
    BEGIN
      ALTER TABLE public.customer_accounts ADD CONSTRAINT customer_accounts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.business_profiles (user_id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK customer_accounts_provider_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_accounts_provider_id_fkey') THEN
    BEGIN
      ALTER TABLE public.customer_accounts ADD CONSTRAINT customer_accounts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.public_booking_profiles (user_id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK customer_accounts_provider_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
