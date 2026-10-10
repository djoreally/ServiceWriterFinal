-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_email_messages
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_email_messages (
  body_html text,
  body_text text NOT NULL,
  cc_emails text[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  direction text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imap_uid numeric,
  in_reply_to text,
  internet_message_id uuid,
  is_read boolean NOT NULL,
  received_at timestamptz NOT NULL,
  subject text NOT NULL,
  thread_key text NOT NULL,
  to_emails text[] NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_email_messages ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_email_messages' AND policyname='fleet_email_messages_re_owner_all') THEN
  CREATE POLICY fleet_email_messages_re_owner_all ON public.fleet_email_messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
