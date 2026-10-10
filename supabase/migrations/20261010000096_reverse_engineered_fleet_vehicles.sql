-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_vehicles
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  data_origin text NOT NULL,
  deleted_at timestamptz,
  due_status text NOT NULL,
  engine text,
  fleet_client_id uuid NOT NULL,
  fleet_contract_id uuid,
  fleet_location_id uuid,
  fuel_type text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text,
  import_batch_id uuid,
  last_service_date text,
  last_service_mileage numeric,
  license_plate text,
  make text,
  mileage numeric,
  model text,
  next_service_date text,
  next_service_mileage numeric,
  notes text,
  origin_source text,
  status text NOT NULL,
  tekmetric_vehicle_id uuid,
  unit_number text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vin text,
  year numeric
);

ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_vehicles' AND policyname='fleet_vehicles_re_owner_all') THEN
  CREATE POLICY fleet_vehicles_re_owner_all ON public.fleet_vehicles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_vehicles_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_fleet_contract_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_fleet_contract_id_fkey FOREIGN KEY (fleet_contract_id) REFERENCES public.fleet_contracts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_vehicles_fleet_contract_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_fleet_location_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_fleet_location_id_fkey FOREIGN KEY (fleet_location_id) REFERENCES public.fleet_locations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_vehicles_fleet_location_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_vehicles_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
