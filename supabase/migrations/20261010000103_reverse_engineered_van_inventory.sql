-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.van_inventory
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.van_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL,
  last_restocked_at timestamptz,
  min_quantity numeric NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  updated_at timestamptz NOT NULL,
  van_id uuid NOT NULL
);

ALTER TABLE public.van_inventory ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'van_inventory_inventory_item_id_fkey') THEN
    BEGIN
      ALTER TABLE public.van_inventory ADD CONSTRAINT van_inventory_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK van_inventory_inventory_item_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'van_inventory_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.van_inventory ADD CONSTRAINT van_inventory_van_id_fkey FOREIGN KEY (van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK van_inventory_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
