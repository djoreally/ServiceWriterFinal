-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.technician_clock_entries
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.technician_clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  clock_in timestamptz,
  clock_out timestamptz
);

ALTER TABLE public.technician_clock_entries ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_clock_entries' AND policyname='technician_clock_entries_re_select') THEN
  CREATE POLICY technician_clock_entries_re_select ON public.technician_clock_entries FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_clock_entries' AND policyname='technician_clock_entries_re_insert') THEN
  CREATE POLICY technician_clock_entries_re_insert ON public.technician_clock_entries FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_clock_entries' AND policyname='technician_clock_entries_re_update') THEN
  CREATE POLICY technician_clock_entries_re_update ON public.technician_clock_entries FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_clock_entries' AND policyname='technician_clock_entries_re_delete') THEN
  CREATE POLICY technician_clock_entries_re_delete ON public.technician_clock_entries FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
