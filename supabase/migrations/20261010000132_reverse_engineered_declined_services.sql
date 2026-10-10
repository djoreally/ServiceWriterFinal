-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.declined_services
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.declined_services (
  appointment_id uuid,
  catalog_item_id uuid,
  converted_at timestamptz,
  converted_service_id uuid,
  created_at timestamptz DEFAULT now(),
  customer_id uuid,
  decline_notes text,
  decline_reason text,
  declined_at timestamptz,
  estimated_cost numeric,
  follow_up_scheduled_for text,
  follow_up_sent_at timestamptz,
  follow_up_status text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  potential_revenue numeric,
  recommended_service text NOT NULL,
  service_id uuid,
  updated_at timestamptz,
  urgency text,
  user_id uuid NOT NULL,
  vehicle_id uuid,
  was_converted boolean
);

ALTER TABLE public.declined_services ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='declined_services' AND policyname='declined_services_re_owner_all') THEN
  CREATE POLICY declined_services_re_owner_all ON public.declined_services FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_catalog_item_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_catalog_item_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_converted_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_converted_service_id_fkey FOREIGN KEY (converted_service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_converted_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'declined_services_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.declined_services ADD CONSTRAINT declined_services_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK declined_services_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
