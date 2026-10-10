-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.recurring_services
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.recurring_services (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  frequency text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interval numeric NOT NULL,
  is_active boolean NOT NULL,
  next_due_date text NOT NULL,
  service_catalog_id uuid NOT NULL,
  start_date text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid
);

ALTER TABLE public.recurring_services ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recurring_services' AND policyname='recurring_services_re_owner_all') THEN
  CREATE POLICY recurring_services_re_owner_all ON public.recurring_services FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_services_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.recurring_services ADD CONSTRAINT recurring_services_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK recurring_services_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_services_service_catalog_id_fkey') THEN
    BEGIN
      ALTER TABLE public.recurring_services ADD CONSTRAINT recurring_services_service_catalog_id_fkey FOREIGN KEY (service_catalog_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK recurring_services_service_catalog_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_services_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.recurring_services ADD CONSTRAINT recurring_services_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK recurring_services_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
