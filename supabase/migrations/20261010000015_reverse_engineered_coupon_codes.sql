-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.coupon_codes
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.coupon_codes (
  code text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  discount_type text NOT NULL,
  discount_value numeric NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  max_uses numeric,
  min_order_amount numeric,
  updated_at timestamptz NOT NULL,
  used_count numeric,
  user_id uuid NOT NULL,
  valid_from text,
  valid_until text
);

ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='coupon_codes' AND policyname='coupon_codes_re_owner_all') THEN
  CREATE POLICY coupon_codes_re_owner_all ON public.coupon_codes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
