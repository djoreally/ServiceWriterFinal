-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.loyalty_accounts
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifetime_points_earned numeric NOT NULL,
  lifetime_spend_cents numeric NOT NULL,
  points_balance numeric NOT NULL,
  program_id uuid NOT NULL,
  status text NOT NULL,
  tier text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid,
  visit_count numeric NOT NULL
);

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loyalty_accounts' AND policyname='loyalty_accounts_re_owner_all') THEN
  CREATE POLICY loyalty_accounts_re_owner_all ON public.loyalty_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.loyalty_accounts ADD CONSTRAINT loyalty_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK loyalty_accounts_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_program_id_fkey') THEN
    BEGIN
      ALTER TABLE public.loyalty_accounts ADD CONSTRAINT loyalty_accounts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.loyalty_programs (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK loyalty_accounts_program_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.loyalty_accounts ADD CONSTRAINT loyalty_accounts_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK loyalty_accounts_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
