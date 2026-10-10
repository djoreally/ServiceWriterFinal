-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.customers
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.customers (
  acquisition_source text,
  address text,
  average_order_value numeric,
  churn_risk text,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_account_id uuid,
  customer_segment text,
  data_origin text NOT NULL,
  days_since_last_service numeric,
  deleted_at timestamptz,
  email text,
  first_name text,
  first_service_date text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  last_name text,
  last_service_date text,
  latitude numeric,
  lifetime_value numeric,
  longitude numeric,
  name text NOT NULL,
  notes text,
  origin_source text,
  phone text,
  postal_code text,
  segment_score numeric,
  total_services numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  visit_frequency_days numeric
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_re_owner_all') THEN
  CREATE POLICY customers_re_owner_all ON public.customers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_account_id_fkey') THEN
    BEGIN
      ALTER TABLE public.customers ADD CONSTRAINT customers_customer_account_id_fkey FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK customers_customer_account_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.customers ADD CONSTRAINT customers_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK customers_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
