-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.service_catalog_benchmarks
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.service_catalog_benchmarks (
  captured_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  dealer_avg numeric NOT NULL,
  dealer_high numeric NOT NULL,
  dealer_low numeric NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  independent_avg numeric NOT NULL,
  independent_high numeric NOT NULL,
  independent_low numeric NOT NULL,
  repair_title text NOT NULL,
  service_catalog_id uuid NOT NULL,
  shop_price numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_label text,
  vin text
);

ALTER TABLE public.service_catalog_benchmarks ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_catalog_benchmarks' AND policyname='service_catalog_benchmarks_re_owner_all') THEN
  CREATE POLICY service_catalog_benchmarks_re_owner_all ON public.service_catalog_benchmarks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_benchmarks_service_catalog_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_catalog_benchmarks ADD CONSTRAINT service_catalog_benchmarks_service_catalog_id_fkey FOREIGN KEY (service_catalog_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_catalog_benchmarks_service_catalog_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
