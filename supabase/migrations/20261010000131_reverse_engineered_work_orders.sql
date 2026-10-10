-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.work_orders
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.work_orders (
  appointment_id uuid,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  customer_notes text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  execution_phase text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_address text,
  location_lat numeric,
  location_lng numeric,
  mileage_captured numeric,
  order_number text NOT NULL,
  requires_mileage boolean NOT NULL,
  requires_signature boolean NOT NULL,
  requires_vin boolean NOT NULL,
  signature_url text,
  started_at timestamptz,
  status text NOT NULL,
  tech_notes text,
  technician_id uuid,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  van_id uuid,
  vehicle_id uuid,
  vin_captured text
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_orders' AND policyname='work_orders_re_owner_all') THEN
  CREATE POLICY work_orders_re_owner_all ON public.work_orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_orders_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_orders_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_orders_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_van_id_fkey FOREIGN KEY (van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_orders_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_orders_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
