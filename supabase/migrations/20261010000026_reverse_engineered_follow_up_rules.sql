-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.follow_up_rules
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.follow_up_rules (
  action_type text NOT NULL,
  campaign_id uuid,
  churn_risk_filter text[],
  conversions numeric,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  description text,
  email_content text,
  email_subject text,
  email_template_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  last_triggered_at timestamptz,
  max_value_filter numeric,
  min_value_filter numeric,
  name text NOT NULL,
  preset_key text,
  segment_filter text[],
  service_type_filter text[],
  sms_content text,
  task_assignee_id uuid,
  task_description text,
  task_title text,
  times_triggered numeric,
  trigger_days numeric,
  trigger_type text NOT NULL,
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.follow_up_rules ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follow_up_rules' AND policyname='follow_up_rules_re_owner_all') THEN
  CREATE POLICY follow_up_rules_re_owner_all ON public.follow_up_rules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
