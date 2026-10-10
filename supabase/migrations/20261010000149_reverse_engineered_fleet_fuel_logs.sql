-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_fuel_logs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_fuel_logs (
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  fleet_vehicle_id uuid,
  fuel_date text NOT NULL,
  fuel_type text,
  gallons numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  odometer numeric,
  payment_method text,
  price_per_gallon numeric,
  reference_number text,
  source_document_id uuid,
  station_location text,
  station_name text,
  total_amount numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_fuel_logs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_fuel_logs' AND policyname='fleet_fuel_logs_re_owner_all') THEN
  CREATE POLICY fleet_fuel_logs_re_owner_all ON public.fleet_fuel_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_fuel_logs_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_fuel_logs ADD CONSTRAINT fleet_fuel_logs_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_fuel_logs_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_fuel_logs_source_document_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_fuel_logs ADD CONSTRAINT fleet_fuel_logs_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.document_intake (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_fuel_logs_source_document_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
