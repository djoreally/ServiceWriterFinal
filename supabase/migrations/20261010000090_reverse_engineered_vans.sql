-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vans
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vans (
  assigned_technician_id uuid,
  capacity_notes text,
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  current_location jsonb,
  equipment_list jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_expiry text,
  is_active boolean NOT NULL,
  last_location_update text,
  last_service_date text,
  license_plate text,
  make text,
  model text,
  name text NOT NULL,
  next_service_date text,
  odometer_miles numeric,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vin text,
  year numeric
);

ALTER TABLE public.vans ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vans' AND policyname='vans_re_owner_all') THEN
  CREATE POLICY vans_re_owner_all ON public.vans FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vans_assigned_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vans ADD CONSTRAINT vans_assigned_technician_id_fkey FOREIGN KEY (assigned_technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vans_assigned_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
