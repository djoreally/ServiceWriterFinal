-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.job_thread_participants
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.job_thread_participants (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_read_at timestamptz,
  removed_at timestamptz,
  role text NOT NULL,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.job_thread_participants ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_thread_participants' AND policyname='job_thread_participants_re_owner_all') THEN
  CREATE POLICY job_thread_participants_re_owner_all ON public.job_thread_participants FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_thread_participants_thread_id_fkey') THEN
    BEGIN
      ALTER TABLE public.job_thread_participants ADD CONSTRAINT job_thread_participants_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.job_threads (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK job_thread_participants_thread_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
