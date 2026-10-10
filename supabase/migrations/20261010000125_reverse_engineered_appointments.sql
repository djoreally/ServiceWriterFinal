-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.appointments
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.appointments (
  actual_end_time text,
  actual_start_time text,
  applied_tax_rate numeric,
  assigned_at timestamptz,
  assigned_technician_id uuid,
  assigned_van_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_account_id uuid,
  customer_city text,
  customer_id uuid,
  customer_postal_code text,
  customer_state text,
  data_origin text NOT NULL,
  deleted_at timestamptz,
  description text,
  dispatch_notes text,
  dispatch_status text,
  duration_minutes numeric NOT NULL,
  estimated_cost numeric,
  estimated_duration_minutes numeric,
  estimated_travel_minutes_from_base numeric,
  google_calendar_event_id uuid,
  google_calendar_synced_at timestamptz,
  guest_email text,
  guest_name text,
  guest_phone text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  intake_responses jsonb,
  job_priority text,
  location_address text,
  location_geocode_confidence numeric,
  location_lat numeric,
  location_lng numeric,
  location_place_id uuid,
  location_routable_lat numeric,
  location_routable_lng numeric,
  location_verified_at timestamptz,
  management_token text,
  mileage_captured numeric,
  notes text,
  origin_source text,
  payment_status text,
  reminder_sent_at timestamptz,
  reward_applied_at timestamptz,
  reward_discount_cents numeric NOT NULL,
  reward_instance_id uuid,
  scheduled_date text NOT NULL,
  scheduled_time text NOT NULL,
  service_catalog_id uuid,
  service_record_id uuid,
  service_zone_id uuid,
  source text,
  status text NOT NULL,
  tax_amount numeric,
  tax_jurisdiction_details jsonb,
  terms_accepted_at timestamptz,
  title text NOT NULL,
  travel_time_minutes numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid,
  vin_captured text,
  weather_decision text,
  weather_evaluated_at timestamptz,
  weather_risk_score numeric
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointments' AND policyname='appointments_re_owner_all') THEN
  CREATE POLICY appointments_re_owner_all ON public.appointments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_assigned_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_assigned_technician_id_fkey FOREIGN KEY (assigned_technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_assigned_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_assigned_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_assigned_van_id_fkey FOREIGN KEY (assigned_van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_assigned_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_customer_account_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_customer_account_id_fkey FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_customer_account_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_reward_instance_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_reward_instance_id_fkey FOREIGN KEY (reward_instance_id) REFERENCES public.loyalty_reward_instances (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_reward_instance_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_service_catalog_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_service_catalog_id_fkey FOREIGN KEY (service_catalog_id) REFERENCES public.service_catalog (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_service_catalog_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_service_record_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_service_record_id_fkey FOREIGN KEY (service_record_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_service_record_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_service_zone_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_service_zone_id_fkey FOREIGN KEY (service_zone_id) REFERENCES public.service_zones (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_service_zone_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.appointments ADD CONSTRAINT appointments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK appointments_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
