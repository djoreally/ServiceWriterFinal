-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.document_intake
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.document_intake (
  confidence numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  extracted_vin text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes numeric,
  fleet_vehicle_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime_type text NOT NULL,
  notes text,
  parse_error text,
  parse_method text,
  parse_status text NOT NULL,
  parsed_json jsonb,
  profile text NOT NULL,
  promoted_expense_id uuid,
  promoted_fuel_log_id uuid,
  promoted_work_order_id uuid,
  raw_text text,
  rejection_reason text,
  review_status text NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz NOT NULL,
  uploaded_by_user_id uuid,
  user_id uuid NOT NULL,
  vin_valid boolean
);

ALTER TABLE public.document_intake ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='document_intake' AND policyname='document_intake_re_owner_all') THEN
  CREATE POLICY document_intake_re_owner_all ON public.document_intake FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intake_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.document_intake ADD CONSTRAINT document_intake_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK document_intake_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intake_promoted_expense_id_fkey') THEN
    BEGIN
      ALTER TABLE public.document_intake ADD CONSTRAINT document_intake_promoted_expense_id_fkey FOREIGN KEY (promoted_expense_id) REFERENCES public.expenses (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK document_intake_promoted_expense_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intake_promoted_fuel_log_fk') THEN
    BEGIN
      ALTER TABLE public.document_intake ADD CONSTRAINT document_intake_promoted_fuel_log_fk FOREIGN KEY (promoted_fuel_log_id) REFERENCES public.fleet_fuel_logs (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK document_intake_promoted_fuel_log_fk skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intake_promoted_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.document_intake ADD CONSTRAINT document_intake_promoted_work_order_id_fkey FOREIGN KEY (promoted_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK document_intake_promoted_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
