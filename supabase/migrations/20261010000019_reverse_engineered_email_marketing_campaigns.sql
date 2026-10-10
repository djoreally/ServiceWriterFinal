-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.email_marketing_campaigns
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.email_marketing_campaigns (
  click_count numeric,
  content text NOT NULL,
  conversion_count numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  delivered_count numeric NOT NULL,
  failed_count numeric NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_engagement_at timestamptz,
  name text NOT NULL,
  open_count numeric,
  opt_out_count numeric NOT NULL,
  recipient_count numeric,
  recipient_ids text[],
  recipient_type text NOT NULL,
  reply_count numeric NOT NULL,
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text NOT NULL,
  subject text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.email_marketing_campaigns ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_marketing_campaigns' AND policyname='email_marketing_campaigns_re_owner_all') THEN
  CREATE POLICY email_marketing_campaigns_re_owner_all ON public.email_marketing_campaigns FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
