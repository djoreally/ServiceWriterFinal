-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.workspace_billing
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.workspace_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  plan_tier text,
  billing_interval text,
  payments_addon_active boolean,
  additional_technician_quantity integer,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (workspace_id)
);

ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from workspace_id column (canonical tenant key per scripts/schema-contract.json).
-- Policies mirror the repo idiom (is_workspace_staff/is_workspace_writer).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_billing' AND policyname='workspace_billing_re_select') THEN
  CREATE POLICY workspace_billing_re_select ON public.workspace_billing FOR SELECT TO authenticated using (public.is_workspace_staff(workspace_id)) ;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_billing' AND policyname='workspace_billing_re_insert') THEN
  CREATE POLICY workspace_billing_re_insert ON public.workspace_billing FOR INSERT TO authenticated with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_billing' AND policyname='workspace_billing_re_update') THEN
  CREATE POLICY workspace_billing_re_update ON public.workspace_billing FOR UPDATE TO authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_billing' AND policyname='workspace_billing_re_delete') THEN
  CREATE POLICY workspace_billing_re_delete ON public.workspace_billing FOR DELETE TO authenticated using (public.is_workspace_writer(workspace_id)) ;
  END IF;
END
$do$;
