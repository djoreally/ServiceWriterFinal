-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.sms_preferences
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.sms_preferences (
  cancellation_enabled boolean NOT NULL,
  confirmation_enabled boolean NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  reminder_enabled boolean NOT NULL,
  reminder_hours_before numeric NOT NULL,
  reschedule_enabled boolean NOT NULL,
  template_cancellation text,
  template_confirmation text,
  template_reminder text,
  template_reschedule text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.sms_preferences ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_preferences' AND policyname='sms_preferences_re_owner_all') THEN
  CREATE POLICY sms_preferences_re_owner_all ON public.sms_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
