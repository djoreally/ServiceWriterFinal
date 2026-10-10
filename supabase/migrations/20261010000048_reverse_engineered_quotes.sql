-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.quotes
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.quotes (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  description text NOT NULL,
  estimate_market_avg numeric,
  estimate_source text,
  estimate_tier text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_cost numeric,
  labor_hours numeric,
  notes text,
  parts_cost numeric,
  quote_date text NOT NULL,
  quote_number text NOT NULL,
  status text NOT NULL,
  total_cost numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  valid_until text,
  vehicle_id uuid
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotes' AND policyname='quotes_re_owner_all') THEN
  CREATE POLICY quotes_re_owner_all ON public.quotes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
