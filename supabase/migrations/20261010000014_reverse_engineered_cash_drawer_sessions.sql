-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.cash_drawer_sessions
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.cash_drawer_sessions (
  cash_in_total numeric,
  cash_out_total numeric,
  cash_sales_total numeric,
  closing_amount numeric,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  expected_closing numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_amount numeric NOT NULL,
  staff_name text,
  started_at timestamptz NOT NULL,
  status text,
  updated_at timestamptz,
  user_id uuid NOT NULL,
  variance numeric,
  variance_reason text
);

ALTER TABLE public.cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_drawer_sessions' AND policyname='cash_drawer_sessions_re_owner_all') THEN
  CREATE POLICY cash_drawer_sessions_re_owner_all ON public.cash_drawer_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
