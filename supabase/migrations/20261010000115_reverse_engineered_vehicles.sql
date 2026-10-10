-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicles
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicles (
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  data_origin text NOT NULL,
  deleted_at timestamptz,
  engine text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text,
  import_batch_id uuid,
  license_plate text,
  make text NOT NULL,
  mileage numeric,
  model text NOT NULL,
  notes text,
  odometer_measure text,
  oil_capacity text,
  oil_type text,
  origin_source text,
  plate_state text,
  tire_load_index text,
  tire_size text,
  tire_size_front text,
  tire_size_rear text,
  tire_size_source text,
  tire_speed_rating text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vin text,
  year numeric NOT NULL
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vehicles' AND policyname='vehicles_re_owner_all') THEN
  CREATE POLICY vehicles_re_owner_all ON public.vehicles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicles_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicles_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
