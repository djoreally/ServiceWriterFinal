-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.retention_signals
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.retention_signals (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  decision_key text,
  definition_version numeric NOT NULL,
  detected_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_jsonb jsonb,
  policy_version numeric,
  resolution_reason text,
  resolved_at timestamptz,
  score numeric,
  signal_type text NOT NULL,
  source_event_id uuid,
  source_fact_id uuid,
  status text NOT NULL,
  suppressed_at timestamptz,
  suppression_reason text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid
);

ALTER TABLE public.retention_signals ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retention_signals' AND policyname='retention_signals_re_owner_all') THEN
  CREATE POLICY retention_signals_re_owner_all ON public.retention_signals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_signals_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_signals ADD CONSTRAINT retention_signals_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_signals_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_signals_source_event_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_signals ADD CONSTRAINT retention_signals_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.retention_events (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_signals_source_event_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_signals_source_fact_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_signals ADD CONSTRAINT retention_signals_source_fact_id_fkey FOREIGN KEY (source_fact_id) REFERENCES public.retention_events (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_signals_source_fact_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_signals_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_signals ADD CONSTRAINT retention_signals_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_signals_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
