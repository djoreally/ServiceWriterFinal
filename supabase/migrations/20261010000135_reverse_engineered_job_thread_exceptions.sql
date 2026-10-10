-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.job_thread_exceptions
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.job_thread_exceptions (
  attachments jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  exception_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  note text,
  resolved_at timestamptz,
  thread_id uuid NOT NULL
);

ALTER TABLE public.job_thread_exceptions ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_thread_exceptions_thread_id_fkey') THEN
    BEGIN
      ALTER TABLE public.job_thread_exceptions ADD CONSTRAINT job_thread_exceptions_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.job_threads (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK job_thread_exceptions_thread_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
