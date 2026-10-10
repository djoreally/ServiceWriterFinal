-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.retention_events
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.retention_events (
  aggregate_id uuid NOT NULL,
  aggregate_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  event_name text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text,
  occurred_at timestamptz NOT NULL,
  payload_jsonb jsonb,
  processed_at timestamptz,
  processing_error text,
  schema_version numeric NOT NULL,
  source_system text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid
);

ALTER TABLE public.retention_events ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retention_events' AND policyname='retention_events_re_owner_all') THEN
  CREATE POLICY retention_events_re_owner_all ON public.retention_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_events_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_events ADD CONSTRAINT retention_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_events_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_events_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_events ADD CONSTRAINT retention_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_events_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
