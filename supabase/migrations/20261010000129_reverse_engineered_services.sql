-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.services
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.services (
  appointment_id uuid,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  data_origin text NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  description text NOT NULL,
  discount_amount numeric,
  discount_type text,
  duration_minutes numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  labor_cost numeric,
  labor_hours numeric,
  license_plate text,
  mileage numeric,
  notes text,
  odometer_measure text,
  oil_quarts_used numeric,
  origin_source text,
  paid_amount numeric,
  parts_cost numeric,
  parts_used text,
  payment_status text,
  service_date text NOT NULL,
  service_number text,
  service_type text NOT NULL,
  shop_supplies numeric,
  started_at timestamptz,
  status text NOT NULL,
  tax_amount numeric,
  tax_rate numeric,
  technician text,
  total_cost numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_engine text,
  vehicle_id uuid,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  vehicle_year numeric,
  vin_captured text
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='services_re_owner_all') THEN
  CREATE POLICY services_re_owner_all ON public.services FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_services_customer') THEN
    BEGIN
      ALTER TABLE public.services ADD CONSTRAINT fk_services_customer FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fk_services_customer skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.services ADD CONSTRAINT services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK services_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.services ADD CONSTRAINT services_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK services_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.services ADD CONSTRAINT services_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK services_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.services ADD CONSTRAINT services_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK services_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
