-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_import_audit_log
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_import_audit_log (
  actor_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  details jsonb NOT NULL,
  event_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid
);

ALTER TABLE public.vehicle_import_audit_log ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_import_audit_log_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_import_audit_log ADD CONSTRAINT vehicle_import_audit_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.vehicle_import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_import_audit_log_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_import_audit_log_row_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_import_audit_log ADD CONSTRAINT vehicle_import_audit_log_row_id_fkey FOREIGN KEY (row_id) REFERENCES public.vehicle_import_rows (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_import_audit_log_row_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
