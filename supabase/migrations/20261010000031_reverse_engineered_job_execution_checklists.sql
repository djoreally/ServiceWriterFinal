-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.job_execution_checklists
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.job_execution_checklists (
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  evidence_url text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_required boolean NOT NULL,
  job_id uuid NOT NULL,
  job_source text NOT NULL,
  notes text,
  requires_photo boolean NOT NULL,
  status text NOT NULL,
  step_key text NOT NULL,
  step_name text NOT NULL,
  step_order numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.job_execution_checklists ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_execution_checklists' AND policyname='job_execution_checklists_re_owner_all') THEN
  CREATE POLICY job_execution_checklists_re_owner_all ON public.job_execution_checklists FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
