-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.retention_vehicle_profiles
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.retention_vehicle_profiles (
  avg_days_between_services numeric,
  avg_miles_between_services numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  days_overdue numeric,
  engagement_score numeric,
  last_recalculated_at timestamptz,
  last_service_date text,
  last_service_id uuid,
  last_service_mileage numeric,
  lifecycle_status text NOT NULL,
  miles_overdue numeric,
  predicted_next_service_date text,
  predicted_next_service_mileage numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid NOT NULL
);

ALTER TABLE public.retention_vehicle_profiles ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retention_vehicle_profiles' AND policyname='retention_vehicle_profiles_re_owner_all') THEN
  CREATE POLICY retention_vehicle_profiles_re_owner_all ON public.retention_vehicle_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_vehicle_profiles_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_vehicle_profiles ADD CONSTRAINT retention_vehicle_profiles_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_vehicle_profiles_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_vehicle_profiles_last_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_vehicle_profiles ADD CONSTRAINT retention_vehicle_profiles_last_service_id_fkey FOREIGN KEY (last_service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_vehicle_profiles_last_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_vehicle_profiles_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_vehicle_profiles ADD CONSTRAINT retention_vehicle_profiles_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_vehicle_profiles_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
