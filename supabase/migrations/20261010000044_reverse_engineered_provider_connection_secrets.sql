-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.provider_connection_secrets
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.provider_connection_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (workspace_id, provider)
);

ALTER TABLE public.provider_connection_secrets ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connection_secrets' AND policyname='provider_connection_secrets_re_select') THEN
  CREATE POLICY provider_connection_secrets_re_select ON public.provider_connection_secrets FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connection_secrets' AND policyname='provider_connection_secrets_re_insert') THEN
  CREATE POLICY provider_connection_secrets_re_insert ON public.provider_connection_secrets FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connection_secrets' AND policyname='provider_connection_secrets_re_update') THEN
  CREATE POLICY provider_connection_secrets_re_update ON public.provider_connection_secrets FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_connection_secrets' AND policyname='provider_connection_secrets_re_delete') THEN
  CREATE POLICY provider_connection_secrets_re_delete ON public.provider_connection_secrets FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
