-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.email_logs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.email_logs (
  campaign_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  email_type text NOT NULL,
  error_message text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_event text,
  last_event_at timestamptz,
  metadata jsonb,
  provider text,
  provider_message_id uuid,
  queue_id uuid,
  recipient_email text NOT NULL,
  recipient_name text,
  retry_recommended boolean NOT NULL,
  review_request_id uuid,
  source text NOT NULL,
  status text NOT NULL,
  subject text,
  suppression_state boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_logs' AND policyname='email_logs_re_owner_all') THEN
  CREATE POLICY email_logs_re_owner_all ON public.email_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
