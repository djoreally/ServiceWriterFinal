-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.webhook_events
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  error_message text,
  event_type text NOT NULL,
  external_event_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  processed_at timestamptz,
  provider text NOT NULL,
  received_at timestamptz NOT NULL,
  signature_verified boolean NOT NULL,
  status text NOT NULL,
  workspace_id uuid
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_re_select') THEN
  CREATE POLICY webhook_events_re_select ON public.webhook_events FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_re_insert') THEN
  CREATE POLICY webhook_events_re_insert ON public.webhook_events FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_re_update') THEN
  CREATE POLICY webhook_events_re_update ON public.webhook_events FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_re_delete') THEN
  CREATE POLICY webhook_events_re_delete ON public.webhook_events FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_workspace_id_fkey') THEN
    BEGIN
      ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK webhook_events_workspace_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
