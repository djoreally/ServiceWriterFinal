-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_recommendations
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_recommendations (
  created_at timestamptz DEFAULT now() NOT NULL,
  created_from_service_id uuid,
  description text,
  dismissed_at timestamptz,
  due_date text,
  due_mileage numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interval_miles numeric,
  interval_months numeric,
  is_dismissed boolean NOT NULL,
  last_service_date text,
  last_service_mileage numeric,
  priority text NOT NULL,
  recommendation_type text NOT NULL,
  title text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid NOT NULL
);

ALTER TABLE public.vehicle_recommendations ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vehicle_recommendations' AND policyname='vehicle_recommendations_re_owner_all') THEN
  CREATE POLICY vehicle_recommendations_re_owner_all ON public.vehicle_recommendations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
