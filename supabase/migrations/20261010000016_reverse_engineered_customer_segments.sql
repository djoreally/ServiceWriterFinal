-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.customer_segments
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.customer_segments (
  auto_campaign_id uuid,
  auto_follow_up_days numeric,
  calculation_error text,
  calculation_started_at timestamptz,
  calculation_status text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now(),
  customer_count numeric,
  description text,
  geo_center_lat numeric,
  geo_center_lng numeric,
  geo_radius_miles numeric,
  icon text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  is_auto boolean,
  last_calculated_at timestamptz,
  max_average_order numeric,
  max_days_since_service numeric,
  max_lifetime_value numeric,
  max_total_services numeric,
  member_count numeric NOT NULL,
  min_average_order numeric,
  min_days_since_service numeric,
  min_lifetime_value numeric,
  min_total_services numeric,
  name text NOT NULL,
  priority numeric,
  service_types_include text[],
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_segments' AND policyname='customer_segments_re_owner_all') THEN
  CREATE POLICY customer_segments_re_owner_all ON public.customer_segments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
