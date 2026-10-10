-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_part_assignments
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_part_assignments (
  brand text,
  created_at timestamptz DEFAULT now() NOT NULL,
  fleet_vehicle_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid,
  is_required boolean NOT NULL,
  notes text,
  oem_number text,
  part_category text NOT NULL,
  part_number text NOT NULL,
  quantity numeric NOT NULL,
  unit text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid,
  vehicle_kind text NOT NULL,
  verified_at timestamptz,
  verified_by uuid
);

ALTER TABLE public.vehicle_part_assignments ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vehicle_part_assignments' AND policyname='vehicle_part_assignments_re_owner_all') THEN
  CREATE POLICY vehicle_part_assignments_re_owner_all ON public.vehicle_part_assignments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_part_assignments_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_part_assignments ADD CONSTRAINT vehicle_part_assignments_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_part_assignments_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_part_assignments_inventory_item_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_part_assignments ADD CONSTRAINT vehicle_part_assignments_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_part_assignments_inventory_item_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_part_assignments_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.vehicle_part_assignments ADD CONSTRAINT vehicle_part_assignments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK vehicle_part_assignments_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
