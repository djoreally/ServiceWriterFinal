-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_intelligence_profiles
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_intelligence_profiles (
  created_at timestamptz DEFAULT now() NOT NULL,
  derived_defaults jsonb NOT NULL,
  effective_defaults jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_defaults jsonb,
  source_profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  vin text
);

ALTER TABLE public.vehicle_intelligence_profiles ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vehicle_intelligence_profiles' AND policyname='vehicle_intelligence_profiles_re_owner_all') THEN
  CREATE POLICY vehicle_intelligence_profiles_re_owner_all ON public.vehicle_intelligence_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_intelligence_profiles_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_intelligence_profiles ADD CONSTRAINT vehicle_intelligence_profiles_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_intelligence_profiles_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
