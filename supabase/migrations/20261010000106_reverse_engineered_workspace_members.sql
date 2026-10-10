-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.workspace_members
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.workspace_members (
  created_at timestamptz DEFAULT now() NOT NULL,
  is_active boolean NOT NULL,
  role text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_members' AND policyname='workspace_members_re_select') THEN
  CREATE POLICY workspace_members_re_select ON public.workspace_members FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_members' AND policyname='workspace_members_re_insert') THEN
  CREATE POLICY workspace_members_re_insert ON public.workspace_members FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_members' AND policyname='workspace_members_re_update') THEN
  CREATE POLICY workspace_members_re_update ON public.workspace_members FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_members' AND policyname='workspace_members_re_delete') THEN
  CREATE POLICY workspace_members_re_delete ON public.workspace_members FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_user_id_fkey') THEN
    BEGIN
      ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK workspace_members_user_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_id_fkey') THEN
    BEGIN
      ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK workspace_members_workspace_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
