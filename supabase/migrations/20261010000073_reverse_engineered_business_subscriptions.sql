-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.business_subscriptions
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  cancel_at_period_end boolean NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  current_period_end text,
  current_period_start text,
  grace_notifications_sent numeric NOT NULL,
  grace_period_ends_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  status text NOT NULL,
  stripe_customer_id uuid,
  stripe_subscription_id uuid,
  trial_ends_at timestamptz,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='business_subscriptions' AND policyname='business_subscriptions_re_owner_all') THEN
  CREATE POLICY business_subscriptions_re_owner_all ON public.business_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_subscriptions_plan_id_fkey') THEN
    BEGIN
      ALTER TABLE public.business_subscriptions ADD CONSTRAINT business_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.platform_plans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK business_subscriptions_plan_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
