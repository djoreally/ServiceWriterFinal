-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.retention_action_executions
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.retention_action_executions (
  action_type text NOT NULL,
  campaign_enrollment_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  executed_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_jsonb jsonb,
  rule_id uuid,
  scheduled_for text,
  signal_id uuid,
  source_event_id uuid,
  status text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.retention_action_executions ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retention_action_executions' AND policyname='retention_action_executions_re_owner_all') THEN
  CREATE POLICY retention_action_executions_re_owner_all ON public.retention_action_executions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_action_executions_campaign_enrollment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_action_executions ADD CONSTRAINT retention_action_executions_campaign_enrollment_id_fkey FOREIGN KEY (campaign_enrollment_id) REFERENCES public.retention_campaign_enrollments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_action_executions_campaign_enrollment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_action_executions_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_action_executions ADD CONSTRAINT retention_action_executions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_action_executions_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_action_executions_rule_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_action_executions ADD CONSTRAINT retention_action_executions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.automation_rules (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_action_executions_rule_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_action_executions_signal_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_action_executions ADD CONSTRAINT retention_action_executions_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.retention_signals (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_action_executions_signal_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_action_executions_source_event_id_fkey') THEN
    BEGIN
      ALTER TABLE public.retention_action_executions ADD CONSTRAINT retention_action_executions_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.retention_events (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK retention_action_executions_source_event_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
