-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_import_rows
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_import_rows (
  batch_id uuid NOT NULL,
  commit_status text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  decode_status text NOT NULL,
  decoded_payload jsonb,
  duplicate_status text NOT NULL,
  existing_vehicle_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapped_payload jsonb NOT NULL,
  normalized_payload jsonb NOT NULL,
  previous_validation_status text,
  raw_payload jsonb NOT NULL,
  resolution_payload jsonb,
  row_index numeric NOT NULL,
  spec_payload jsonb,
  updated_at timestamptz NOT NULL,
  validation_messages jsonb NOT NULL,
  validation_status text NOT NULL
);

ALTER TABLE public.vehicle_import_rows ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_import_rows_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_import_rows ADD CONSTRAINT vehicle_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.vehicle_import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_import_rows_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_import_rows_existing_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_import_rows ADD CONSTRAINT vehicle_import_rows_existing_vehicle_id_fkey FOREIGN KEY (existing_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_import_rows_existing_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
