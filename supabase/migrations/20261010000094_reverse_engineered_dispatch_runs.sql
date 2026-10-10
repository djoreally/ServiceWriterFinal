-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.dispatch_runs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.dispatch_runs (
  created_at timestamptz DEFAULT now() NOT NULL,
  end_location_lat numeric,
  end_location_lng numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date text NOT NULL,
  start_location_lat numeric,
  start_location_lng numeric,
  status text NOT NULL,
  technician_id uuid NOT NULL,
  total_distance_meters numeric,
  total_travel_time_seconds numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  van_id uuid
);

ALTER TABLE public.dispatch_runs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_runs' AND policyname='dispatch_runs_re_owner_all') THEN
  CREATE POLICY dispatch_runs_re_owner_all ON public.dispatch_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_runs_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.dispatch_runs ADD CONSTRAINT dispatch_runs_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK dispatch_runs_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_runs_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.dispatch_runs ADD CONSTRAINT dispatch_runs_van_id_fkey FOREIGN KEY (van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK dispatch_runs_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
