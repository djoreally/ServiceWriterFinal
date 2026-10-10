-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.invoice_lines
-- Source of column list: src/integrations/supabase/types.production.ts (production snapshot)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  created_at timestamptz DEFAULT now() NOT NULL,
  description text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  metadata jsonb NOT NULL,
  quantity numeric NOT NULL,
  service_catalog_id uuid,
  sort_order numeric NOT NULL,
  tax_rate numeric NOT NULL,
  unit_price numeric NOT NULL,
  vehicle_id uuid,
  workspace_id uuid NOT NULL
);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_lines' AND policyname='invoice_lines_re_select') THEN
  CREATE POLICY invoice_lines_re_select ON public.invoice_lines FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_lines' AND policyname='invoice_lines_re_insert') THEN
  CREATE POLICY invoice_lines_re_insert ON public.invoice_lines FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_lines' AND policyname='invoice_lines_re_update') THEN
  CREATE POLICY invoice_lines_re_update ON public.invoice_lines FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_lines' AND policyname='invoice_lines_re_delete') THEN
  CREATE POLICY invoice_lines_re_delete ON public.invoice_lines FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_workspace_id_fkey') THEN
    BEGIN
      ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK invoice_lines_workspace_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_workspace_id_invoice_id_fkey') THEN
    BEGIN
      ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_workspace_id_invoice_id_fkey FOREIGN KEY (workspace_id, invoice_id) REFERENCES public.invoices (workspace_id, id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK invoice_lines_workspace_id_invoice_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_workspace_service_fkey') THEN
    BEGIN
      ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_workspace_service_fkey FOREIGN KEY (workspace_id, service_catalog_id) REFERENCES public.service_catalog (workspace_id, id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK invoice_lines_workspace_service_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_workspace_vehicle_fkey') THEN
    BEGIN
      ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_workspace_vehicle_fkey FOREIGN KEY (workspace_id, vehicle_id) REFERENCES public.vehicles (workspace_id, id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK invoice_lines_workspace_vehicle_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
