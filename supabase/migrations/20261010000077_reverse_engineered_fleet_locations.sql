-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_locations
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_locations (
  access_instructions text,
  address text,
  city text,
  created_at timestamptz DEFAULT now() NOT NULL,
  fleet_client_id uuid NOT NULL,
  geofence_enabled boolean,
  geofence_radius_meters numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_primary boolean NOT NULL,
  latitude numeric,
  longitude numeric,
  name text NOT NULL,
  notes text,
  postal_code text,
  service_window_end text,
  service_window_start text,
  site_contact_name text,
  site_contact_phone text,
  state text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_locations ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_locations' AND policyname='fleet_locations_re_owner_all') THEN
  CREATE POLICY fleet_locations_re_owner_all ON public.fleet_locations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_locations_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_locations ADD CONSTRAINT fleet_locations_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_locations_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
