-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.provider_connections
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.provider_connections (
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid,
  external_account_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_synced_at timestamptz,
  metadata jsonb NOT NULL,
  provider text NOT NULL,
  scopes text[] NOT NULL,
  secret_reference text,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  workspace_id uuid NOT NULL
);

ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connections' AND policyname='provider_connections_re_select') THEN
  CREATE POLICY provider_connections_re_select ON public.provider_connections FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connections' AND policyname='provider_connections_re_insert') THEN
  CREATE POLICY provider_connections_re_insert ON public.provider_connections FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connections' AND policyname='provider_connections_re_update') THEN
  CREATE POLICY provider_connections_re_update ON public.provider_connections FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connections' AND policyname='provider_connections_re_delete') THEN
  CREATE POLICY provider_connections_re_delete ON public.provider_connections FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_connections_created_by_fkey') THEN
    BEGIN
      ALTER TABLE public.provider_connections ADD CONSTRAINT provider_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK provider_connections_created_by_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_connections_workspace_id_fkey') THEN
    BEGIN
      ALTER TABLE public.provider_connections ADD CONSTRAINT provider_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK provider_connections_workspace_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
