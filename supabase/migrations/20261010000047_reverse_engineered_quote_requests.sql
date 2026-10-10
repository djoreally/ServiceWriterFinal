-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.quote_requests
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.quote_requests (
  converted_quote_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  estimate_avg numeric,
  estimate_high numeric,
  estimate_low numeric,
  guest_email text,
  guest_name text,
  guest_phone text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  pricing_tier text NOT NULL,
  repair_title text,
  shop_price numeric,
  source text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_make text,
  vehicle_model text,
  vehicle_year numeric,
  vin text
);

ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_requests' AND policyname='quote_requests_re_owner_all') THEN
  CREATE POLICY quote_requests_re_owner_all ON public.quote_requests FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
