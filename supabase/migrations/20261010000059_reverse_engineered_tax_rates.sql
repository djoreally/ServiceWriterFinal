-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.tax_rates
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.tax_rates (
  city text,
  city_rate numeric,
  combined_rate numeric,
  county text,
  county_rate numeric,
  created_at timestamptz DEFAULT now(),
  effective_date text,
  expires_date text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  postal_code text,
  special_rate numeric,
  state_code text NOT NULL,
  state_rate numeric,
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tax_rates' AND policyname='tax_rates_re_owner_all') THEN
  CREATE POLICY tax_rates_re_owner_all ON public.tax_rates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
