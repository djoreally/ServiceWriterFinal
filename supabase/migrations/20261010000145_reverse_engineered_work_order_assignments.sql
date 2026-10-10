-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.work_order_assignments
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.work_order_assignments (
  assigned_at timestamptz NOT NULL,
  assigned_by uuid,
  unassigned_at timestamptz,
  user_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  workspace_id uuid NOT NULL
);

ALTER TABLE public.work_order_assignments ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_order_assignments' AND policyname='work_order_assignments_re_select') THEN
  CREATE POLICY work_order_assignments_re_select ON public.work_order_assignments FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_order_assignments' AND policyname='work_order_assignments_re_insert') THEN
  CREATE POLICY work_order_assignments_re_insert ON public.work_order_assignments FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_order_assignments' AND policyname='work_order_assignments_re_update') THEN
  CREATE POLICY work_order_assignments_re_update ON public.work_order_assignments FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_order_assignments' AND policyname='work_order_assignments_re_delete') THEN
  CREATE POLICY work_order_assignments_re_delete ON public.work_order_assignments FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_assignments_assigned_by_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_assignments ADD CONSTRAINT work_order_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_assignments_assigned_by_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_assignments_user_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_assignments ADD CONSTRAINT work_order_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_assignments_user_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_assignments_workspace_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_assignments ADD CONSTRAINT work_order_assignments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_assignments_workspace_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_assignments_workspace_id_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_assignments ADD CONSTRAINT work_order_assignments_workspace_id_work_order_id_fkey FOREIGN KEY (workspace_id, work_order_id) REFERENCES public.work_orders (workspace_id, id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_assignments_workspace_id_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
