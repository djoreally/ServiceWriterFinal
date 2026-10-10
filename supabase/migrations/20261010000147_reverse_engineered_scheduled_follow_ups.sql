-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.scheduled_follow_ups
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.scheduled_follow_ups (
  conversion_value numeric,
  converted boolean,
  created_at timestamptz DEFAULT now(),
  customer_id uuid,
  declined_service_id uuid,
  email_opened boolean,
  email_sent boolean,
  error_message text,
  executed_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_clicked boolean,
  priority numeric,
  rule_id uuid,
  scheduled_for text NOT NULL,
  status text,
  trigger_data jsonb NOT NULL,
  trigger_entity_id uuid,
  trigger_entity_type text,
  trigger_type text NOT NULL,
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.scheduled_follow_ups ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_follow_ups' AND policyname='scheduled_follow_ups_re_owner_all') THEN
  CREATE POLICY scheduled_follow_ups_re_owner_all ON public.scheduled_follow_ups FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_follow_ups_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.scheduled_follow_ups ADD CONSTRAINT scheduled_follow_ups_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK scheduled_follow_ups_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_follow_ups_declined_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.scheduled_follow_ups ADD CONSTRAINT scheduled_follow_ups_declined_service_id_fkey FOREIGN KEY (declined_service_id) REFERENCES public.declined_services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK scheduled_follow_ups_declined_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_follow_ups_rule_id_fkey') THEN
    BEGIN
      ALTER TABLE public.scheduled_follow_ups ADD CONSTRAINT scheduled_follow_ups_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.follow_up_rules (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK scheduled_follow_ups_rule_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
