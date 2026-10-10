-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.phone_coupon_overrides
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.phone_coupon_overrides (
  created_at timestamptz DEFAULT now() NOT NULL,
  custom_description text,
  custom_discount_type text,
  custom_discount_value numeric,
  custom_min_order_amount numeric,
  customer_id uuid NOT NULL,
  disabled boolean NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.phone_coupon_overrides ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='phone_coupon_overrides' AND policyname='phone_coupon_overrides_re_owner_all') THEN
  CREATE POLICY phone_coupon_overrides_re_owner_all ON public.phone_coupon_overrides FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_coupon_overrides_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.phone_coupon_overrides ADD CONSTRAINT phone_coupon_overrides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK phone_coupon_overrides_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
