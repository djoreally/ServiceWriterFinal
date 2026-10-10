-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.location_history
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.location_history (
  accuracy numeric,
  activity_type text,
  altitude numeric,
  appointment_id uuid,
  heading numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  recorded_at timestamptz NOT NULL,
  speed numeric,
  technician_id uuid NOT NULL
);

ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_history_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.location_history ADD CONSTRAINT location_history_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK location_history_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_history_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.location_history ADD CONSTRAINT location_history_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK location_history_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
