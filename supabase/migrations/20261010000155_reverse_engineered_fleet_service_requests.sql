-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_service_requests
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_service_requests (
  assigned_to text,
  claimed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_notes text,
  duplicate_of_request_id uuid,
  first_response_at timestamptz,
  fleet_client_id uuid,
  fleet_contact_id uuid,
  fleet_location_id uuid,
  fleet_vehicle_id uuid,
  fleet_work_order_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_notes text,
  match_confidence numeric,
  match_status text NOT NULL,
  preferred_date text,
  preferred_window_end text,
  preferred_window_start text,
  priority text NOT NULL,
  received_at timestamptz NOT NULL,
  request_summary text,
  requester_email text,
  requester_name text,
  requester_role text,
  safety_flags jsonb NOT NULL,
  service_address text,
  sla_due_at timestamptz,
  source_metadata jsonb NOT NULL,
  source_record_id uuid,
  source_thread_key text,
  source_type text NOT NULL,
  status text NOT NULL,
  subject text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_drivable boolean,
  version numeric NOT NULL,
  work_order_draft_id uuid
);

ALTER TABLE public.fleet_service_requests ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_service_requests' AND policyname='fleet_service_requests_re_owner_all') THEN
  CREATE POLICY fleet_service_requests_re_owner_all ON public.fleet_service_requests FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_duplicate_of_request_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_duplicate_of_request_id_fkey FOREIGN KEY (duplicate_of_request_id) REFERENCES public.fleet_service_requests (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_duplicate_of_request_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_fleet_contact_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_fleet_contact_id_fkey FOREIGN KEY (fleet_contact_id) REFERENCES public.fleet_contacts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_fleet_contact_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_fleet_location_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_fleet_location_id_fkey FOREIGN KEY (fleet_location_id) REFERENCES public.fleet_locations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_fleet_location_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_requests_work_order_draft_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_requests ADD CONSTRAINT fleet_service_requests_work_order_draft_id_fkey FOREIGN KEY (work_order_draft_id) REFERENCES public.fleet_work_order_drafts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_requests_work_order_draft_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
