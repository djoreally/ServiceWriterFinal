-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_contracts
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_contracts (
  approval_threshold numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  end_date text,
  fleet_client_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_frequency text NOT NULL,
  is_active boolean NOT NULL,
  name text NOT NULL,
  notes text,
  pricing_rules jsonb,
  sla_hours numeric,
  start_date text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_contracts ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_contracts' AND policyname='fleet_contracts_re_owner_all') THEN
  CREATE POLICY fleet_contracts_re_owner_all ON public.fleet_contracts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_contracts_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_contracts ADD CONSTRAINT fleet_contracts_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_contracts_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
