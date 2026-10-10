-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.technician_skills
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.technician_skills (
  certification_level text,
  certification_number text,
  certified_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  expiration_date text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  issue_date text,
  notes text,
  skill_type text NOT NULL,
  technician_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  years_experience numeric
);

ALTER TABLE public.technician_skills ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_skills' AND policyname='technician_skills_re_owner_all') THEN
  CREATE POLICY technician_skills_re_owner_all ON public.technician_skills FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technician_skills_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.technician_skills ADD CONSTRAINT technician_skills_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK technician_skills_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
