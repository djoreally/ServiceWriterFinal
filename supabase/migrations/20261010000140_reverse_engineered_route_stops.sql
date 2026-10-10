-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.route_stops
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.route_stops (
  actual_arrival text,
  actual_departure text,
  created_at timestamptz DEFAULT now() NOT NULL,
  dispatch_run_id uuid NOT NULL,
  distance_to_next_meters numeric,
  estimated_arrival text,
  estimated_duration_minutes numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_order numeric NOT NULL,
  status text NOT NULL,
  travel_time_to_next_seconds numeric,
  updated_at timestamptz NOT NULL,
  work_order_id uuid NOT NULL
);

ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_stops_dispatch_run_id_fkey') THEN
    BEGIN
      ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_dispatch_run_id_fkey FOREIGN KEY (dispatch_run_id) REFERENCES public.dispatch_runs (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK route_stops_dispatch_run_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_stops_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK route_stops_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
