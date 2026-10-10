-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_operation_batch_items
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_operation_batch_items (
  attempts numeric NOT NULL,
  batch_id uuid NOT NULL,
  compensation_action text,
  error_message text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.fleet_operation_batch_items ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_operation_batch_items_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_operation_batch_items ADD CONSTRAINT fleet_operation_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.fleet_operation_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_operation_batch_items_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
