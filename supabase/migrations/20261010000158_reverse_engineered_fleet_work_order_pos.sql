-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_work_order_pos
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_work_order_pos (
  amount_applied numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  fleet_purchase_order_id uuid NOT NULL,
  fleet_work_order_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.fleet_work_order_pos ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_pos_fleet_purchase_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_pos ADD CONSTRAINT fleet_work_order_pos_fleet_purchase_order_id_fkey FOREIGN KEY (fleet_purchase_order_id) REFERENCES public.fleet_purchase_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_pos_fleet_purchase_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_pos_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_pos ADD CONSTRAINT fleet_work_order_pos_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_pos_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
