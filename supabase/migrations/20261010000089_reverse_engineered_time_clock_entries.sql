-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.time_clock_entries
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.time_clock_entries (
  approved_at timestamptz,
  approved_by uuid,
  break_duration_minutes numeric,
  break_end text,
  break_start text,
  clock_in text NOT NULL,
  clock_in_location jsonb,
  clock_out text,
  clock_out_location jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  edit_reason text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  overtime_hours numeric,
  regular_hours numeric,
  status text NOT NULL,
  technician_id uuid,
  total_hours numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='time_clock_entries' AND policyname='time_clock_entries_re_owner_all') THEN
  CREATE POLICY time_clock_entries_re_owner_all ON public.time_clock_entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_clock_entries_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.time_clock_entries ADD CONSTRAINT time_clock_entries_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK time_clock_entries_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
