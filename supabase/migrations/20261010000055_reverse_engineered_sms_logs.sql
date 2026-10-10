-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.sms_logs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.sms_logs (
  appointment_id uuid,
  correlation_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  delivered_at timestamptz,
  direction text NOT NULL,
  error_message text,
  failed_at timestamptz,
  from_number text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_body text,
  message_type text,
  provider text,
  provider_error_code text,
  provider_status text,
  recipient_hash text,
  status text NOT NULL,
  to_number text,
  to_number_last4 text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_logs' AND policyname='sms_logs_re_owner_all') THEN
  CREATE POLICY sms_logs_re_owner_all ON public.sms_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
