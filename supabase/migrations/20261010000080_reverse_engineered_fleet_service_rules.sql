-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_service_rules
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_service_rules (
  base_labor_package text NOT NULL,
  base_price numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  estimated_duration_minutes numeric,
  fleet_client_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  includes jsonb,
  interval_miles numeric NOT NULL,
  interval_months numeric NOT NULL,
  is_active boolean NOT NULL,
  package_code text,
  package_label text,
  service_class text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_service_rules ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_service_rules' AND policyname='fleet_service_rules_re_owner_all') THEN
  CREATE POLICY fleet_service_rules_re_owner_all ON public.fleet_service_rules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_service_rules_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_service_rules ADD CONSTRAINT fleet_service_rules_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_service_rules_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
