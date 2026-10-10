-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.technicians
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.technicians (
  account_status text NOT NULL,
  address text,
  assigned_at timestamptz,
  auth_user_id uuid,
  avatar_url text,
  avg_job_duration_minutes numeric,
  background_check_status text,
  base_hourly_rate numeric,
  bio text,
  callback_rate numeric,
  certifications jsonb,
  commission_percentage numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  current_location jsonb,
  customer_rating_avg numeric,
  data_origin text NOT NULL,
  deactivated_at timestamptz,
  deactivated_by uuid,
  deleted_at timestamptz,
  display_name text,
  drivers_license_expiry text,
  drivers_license_number text,
  drivers_license_url text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  employment_type text,
  hire_date text,
  home_lat numeric,
  home_lng numeric,
  home_zip text,
  hourly_rate numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  insurance_verified boolean,
  invitation_id uuid,
  is_active boolean,
  jobs_completed_mtd numeric,
  last_location_update text,
  license_expiration_date text,
  location_tracking_enabled boolean,
  max_daily_capacity_hours numeric,
  max_jobs_per_day numeric,
  name text NOT NULL,
  offboarding_notes text,
  origin_source text,
  overtime_rate numeric,
  payroll_type text,
  performance_score numeric,
  phone text,
  redo_rate numeric,
  retained_auth_user_id uuid,
  revenue_generated_mtd numeric,
  service_radius_miles numeric,
  skills text[],
  status text NOT NULL,
  team_id uuid,
  updated_at timestamptz NOT NULL,
  upsell_rate numeric,
  user_id uuid NOT NULL,
  weekly_capacity_hours numeric,
  working_hours jsonb
);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='technicians' AND policyname='technicians_re_owner_all') THEN
  CREATE POLICY technicians_re_owner_all ON public.technicians FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technicians_import_batch_id_fkey') THEN
    BEGIN
      ALTER TABLE public.technicians ADD CONSTRAINT technicians_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK technicians_import_batch_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technicians_invitation_id_fkey') THEN
    BEGIN
      ALTER TABLE public.technicians ADD CONSTRAINT technicians_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.team_invitations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK technicians_invitation_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technicians_team_id_fkey') THEN
    BEGIN
      ALTER TABLE public.technicians ADD CONSTRAINT technicians_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK technicians_team_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
