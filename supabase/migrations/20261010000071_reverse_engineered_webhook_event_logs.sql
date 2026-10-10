-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.webhook_event_logs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.webhook_event_logs (
  attempts numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  error_details jsonb,
  error_message text,
  event_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_attempt_at timestamptz,
  max_attempts numeric NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  related_record_id uuid,
  related_record_type text,
  replayed_at timestamptz,
  replayed_by uuid,
  status text NOT NULL,
  stripe_event_id uuid NOT NULL,
  user_id uuid
);

ALTER TABLE public.webhook_event_logs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_event_logs' AND policyname='webhook_event_logs_re_owner_all') THEN
  CREATE POLICY webhook_event_logs_re_owner_all ON public.webhook_event_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
