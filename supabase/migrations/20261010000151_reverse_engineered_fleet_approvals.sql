-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_approvals
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_approvals (
  approval_type text NOT NULL,
  auto_approve_threshold numeric,
  auto_approved boolean NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  estimated_cost numeric,
  fleet_work_order_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  responded_at timestamptz,
  responded_by uuid,
  response_notes text,
  signature_url text,
  sla_deadline text,
  status text NOT NULL,
  title text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_approvals ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_approvals' AND policyname='fleet_approvals_re_owner_all') THEN
  CREATE POLICY fleet_approvals_re_owner_all ON public.fleet_approvals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_approvals_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_approvals ADD CONSTRAINT fleet_approvals_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_approvals_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
