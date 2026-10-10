-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.job_photos
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.job_photos (
  appointment_id uuid NOT NULL,
  caption text,
  captured_at timestamptz,
  created_at timestamptz DEFAULT now(),
  file_name text,
  file_size numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_required boolean,
  location jsonb,
  photo_type text NOT NULL,
  storage_path text NOT NULL,
  technician_id uuid,
  user_id uuid NOT NULL
);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_photos' AND policyname='job_photos_re_owner_all') THEN
  CREATE POLICY job_photos_re_owner_all ON public.job_photos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_photos_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK job_photos_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_photos_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK job_photos_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
