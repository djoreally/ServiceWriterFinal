-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.technician_notification_preferences
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.technician_notification_preferences (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_email_enabled boolean NOT NULL,
  customer_sms_enabled boolean NOT NULL,
  dispatch_push_enabled boolean NOT NULL,
  offline_cache_enabled boolean NOT NULL,
  push_notifications_enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.technician_notification_preferences ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technician_notification_preferences' AND policyname='technician_notification_preferences_re_owner_all') THEN
  CREATE POLICY technician_notification_preferences_re_owner_all ON public.technician_notification_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
