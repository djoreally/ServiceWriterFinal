-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_work_order_drafts
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_work_order_drafts (
  add_ons jsonb NOT NULL,
  billing_method text,
  contract_id uuid,
  conversion_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  created_from text,
  customer_id uuid,
  estimated_discount numeric,
  estimated_subtotal numeric,
  estimated_tax numeric,
  estimated_total numeric,
  expires_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid,
  notes text,
  po_number text,
  promoted_work_order_id uuid,
  scheduled_date text,
  scheduled_time text,
  selected_vehicles jsonb NOT NULL,
  service_package jsonb,
  source_type text NOT NULL,
  status text NOT NULL,
  technician_id uuid,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_work_order_drafts ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_work_order_drafts' AND policyname='fleet_work_order_drafts_re_owner_all') THEN
  CREATE POLICY fleet_work_order_drafts_re_owner_all ON public.fleet_work_order_drafts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_drafts_contract_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_drafts ADD CONSTRAINT fleet_work_order_drafts_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fleet_contracts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_drafts_contract_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_drafts_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_drafts ADD CONSTRAINT fleet_work_order_drafts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_drafts_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_drafts_location_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_drafts ADD CONSTRAINT fleet_work_order_drafts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.fleet_locations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_drafts_location_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_order_drafts_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_order_drafts ADD CONSTRAINT fleet_work_order_drafts_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_order_drafts_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
