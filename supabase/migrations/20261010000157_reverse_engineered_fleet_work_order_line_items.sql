-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_work_order_line_items
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_work_order_line_items (
  created_at timestamptz DEFAULT now() NOT NULL,
  description text NOT NULL,
  fleet_contract_service_id uuid,
  fleet_vehicle_id uuid,
  fleet_work_order_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid,
  labor_hours numeric,
  line_type text NOT NULL,
  part_number text,
  price_source text NOT NULL,
  quantity numeric NOT NULL,
  service_catalog_id uuid,
  sort_order numeric NOT NULL,
  taxable boolean NOT NULL,
  total numeric NOT NULL,
  unit_price numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  van_id uuid
);

ALTER TABLE public.fleet_work_order_line_items ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_work_order_line_items' AND policyname='fleet_work_order_line_items_re_owner_all') THEN
  CREATE POLICY fleet_work_order_line_items_re_owner_all ON public.fleet_work_order_line_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_fleet_contract_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_fleet_contract_service_id_fkey FOREIGN KEY (fleet_contract_service_id) REFERENCES public.fleet_contract_services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_fleet_contract_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_inventory_item_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_inventory_item_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_service_catalog_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_service_catalog_id_fkey FOREIGN KEY (service_catalog_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_service_catalog_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_line_items_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_line_items ADD CONSTRAINT fleet_work_order_line_items_van_id_fkey FOREIGN KEY (van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_line_items_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
