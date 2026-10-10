-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.job_threads
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.job_threads (
  appointment_id uuid,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid,
  fleet_work_order_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_message_at timestamptz,
  owner_user_id uuid NOT NULL,
  title text,
  type text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.job_threads ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_threads_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.job_threads ADD CONSTRAINT job_threads_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK job_threads_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
