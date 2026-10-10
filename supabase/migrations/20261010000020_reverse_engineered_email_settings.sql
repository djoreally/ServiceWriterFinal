-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.email_settings
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.email_settings (
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  from_email text,
  from_name text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imap_enabled boolean NOT NULL,
  imap_host text,
  imap_last_error text,
  imap_last_synced_at timestamptz,
  imap_last_uid numeric NOT NULL,
  imap_password_encrypted text,
  imap_port numeric NOT NULL,
  imap_secure boolean NOT NULL,
  imap_username text,
  last_test_at timestamptz,
  last_test_error text,
  last_test_status text,
  reply_to_email text,
  smtp_host text,
  smtp_password_encrypted text,
  smtp_port numeric,
  smtp_username text,
  updated_at timestamptz,
  use_custom_smtp boolean,
  user_id uuid NOT NULL,
  verified boolean,
  verified_at timestamptz
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_settings' AND policyname='email_settings_re_owner_all') THEN
  CREATE POLICY email_settings_re_owner_all ON public.email_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
