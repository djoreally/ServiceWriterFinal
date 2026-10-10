-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.workspaces
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.workspaces (
  app_role text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  currency_code text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL,
  kind text NOT NULL,
  legal_name text,
  name text NOT NULL,
  slug text NOT NULL,
  timezone text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_created_by_fkey') THEN
    BEGIN
      ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK workspaces_created_by_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
