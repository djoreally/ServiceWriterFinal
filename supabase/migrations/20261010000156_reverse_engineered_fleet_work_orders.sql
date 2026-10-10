-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_work_orders
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_work_orders (
  accepted_at timestamptz,
  approval_required boolean NOT NULL,
  approval_threshold numeric,
  arrived_at timestamptz,
  assigned_technician_id uuid,
  assigned_van_id uuid,
  checkin_geo jsonb,
  checkout_geo jsonb,
  completed_at timestamptz,
  completion_status text,
  completion_vin_captured text,
  completion_vin_matched boolean,
  compliance_invoice_format_ok boolean NOT NULL,
  compliance_notes_ok boolean NOT NULL,
  compliance_photos_attached boolean NOT NULL,
  compliance_po_attached boolean NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  data_origin text NOT NULL,
  description text,
  digital_signature_url text,
  en_route_at timestamptz,
  external_po text,
  fleet_client_id uuid NOT NULL,
  fleet_contract_id uuid,
  fleet_job_id uuid,
  fleet_location_id uuid,
  fleet_purchase_order_id uuid,
  fleet_vehicle_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  internal_po text,
  invoice_balance_due numeric NOT NULL,
  invoice_id uuid,
  invoice_paid_amount numeric NOT NULL,
  invoice_status text,
  invoiced_at timestamptz,
  labor_hours numeric,
  mileage_at_service numeric,
  next_service_date text,
  next_service_mileage numeric,
  notes text,
  odometer_in numeric,
  odometer_out numeric,
  order_number text,
  origin_source text,
  paid_at timestamptz,
  parts_used jsonb,
  payment_record_id uuid,
  photos text[],
  po_authorization_status text NOT NULL,
  po_number text,
  priority text NOT NULL,
  required_skill text,
  scheduled_date text,
  scheduled_duration_minutes numeric NOT NULL,
  scheduled_time text,
  service_type text,
  signature_captured_at timestamptz,
  sla_deadline text,
  source text,
  source_draft_id uuid,
  source_request_id uuid,
  source_schedule_id uuid,
  started_at timestamptz,
  status text NOT NULL,
  submitted_at timestamptz,
  subtotal numeric,
  tax_amount numeric,
  technician_notes text,
  tekmetric_ro_id uuid,
  tekmetric_synced_at timestamptz,
  total numeric,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vin text
);

ALTER TABLE public.fleet_work_orders ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_work_orders' AND policyname='fleet_work_orders_re_owner_all') THEN
  CREATE POLICY fleet_work_orders_re_owner_all ON public.fleet_work_orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_assigned_technician_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_assigned_technician_id_fkey FOREIGN KEY (assigned_technician_id) REFERENCES public.technicians (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_assigned_technician_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_assigned_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_assigned_van_id_fkey FOREIGN KEY (assigned_van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_assigned_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_contract_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_contract_id_fkey FOREIGN KEY (fleet_contract_id) REFERENCES public.fleet_contracts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_contract_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_job_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_job_id_fkey FOREIGN KEY (fleet_job_id) REFERENCES public.fleet_jobs (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_job_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_location_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_location_id_fkey FOREIGN KEY (fleet_location_id) REFERENCES public.fleet_locations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_location_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_purchase_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_purchase_order_id_fkey FOREIGN KEY (fleet_purchase_order_id) REFERENCES public.fleet_purchase_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_purchase_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_invoice_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_invoice_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_source_draft_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_source_draft_id_fkey FOREIGN KEY (source_draft_id) REFERENCES public.fleet_work_order_drafts (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_source_draft_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_source_request_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.fleet_service_requests (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_source_request_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_work_orders_source_schedule_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_work_orders ADD CONSTRAINT fleet_work_orders_source_schedule_id_fkey FOREIGN KEY (source_schedule_id) REFERENCES public.fleet_service_schedules (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_work_orders_source_schedule_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
