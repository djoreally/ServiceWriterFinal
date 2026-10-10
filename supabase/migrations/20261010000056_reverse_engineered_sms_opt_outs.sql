-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.sms_opt_outs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opted_in_at timestamptz,
  opted_out_at timestamptz NOT NULL,
  phone_hash text NOT NULL,
  phone_last4 text,
  source text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_opt_outs' AND policyname='sms_opt_outs_re_owner_all') THEN
  CREATE POLICY sms_opt_outs_re_owner_all ON public.sms_opt_outs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
