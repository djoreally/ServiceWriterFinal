-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.appointment_services
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.appointment_services (
  added_at_service boolean,
  appointment_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_prepaid boolean,
  name text NOT NULL,
  price numeric NOT NULL,
  quantity numeric NOT NULL,
  service_catalog_id uuid,
  updated_at timestamptz,
  vehicle_id uuid
);

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_service_catalog_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointment_services ADD CONSTRAINT appointment_services_service_catalog_id_fkey FOREIGN KEY (service_catalog_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointment_services_service_catalog_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointment_services ADD CONSTRAINT appointment_services_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointment_services_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointment_services_appointment') THEN
    BEGIN
      ALTER TABLE public.appointment_services ADD CONSTRAINT fk_appointment_services_appointment FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fk_appointment_services_appointment skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
