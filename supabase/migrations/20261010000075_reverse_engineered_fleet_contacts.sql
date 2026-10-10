-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_contacts
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_contacts (
  approve_quotes boolean NOT NULL,
  can_approve_work boolean NOT NULL,
  communication_preference text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  download_reports boolean NOT NULL,
  email text,
  fleet_client_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_primary boolean NOT NULL,
  manage_vehicles boolean NOT NULL,
  name text NOT NULL,
  phone text,
  receives_invoices boolean NOT NULL,
  receives_reports boolean NOT NULL,
  request_service boolean NOT NULL,
  role text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  view_service_history boolean NOT NULL,
  view_vehicles boolean NOT NULL
);

ALTER TABLE public.fleet_contacts ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_contacts' AND policyname='fleet_contacts_re_owner_all') THEN
  CREATE POLICY fleet_contacts_re_owner_all ON public.fleet_contacts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_contacts_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_contacts ADD CONSTRAINT fleet_contacts_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_contacts_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
