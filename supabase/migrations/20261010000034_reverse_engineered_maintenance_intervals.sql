-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.maintenance_intervals
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.maintenance_intervals (
  created_at timestamptz DEFAULT now() NOT NULL,
  default_interval_miles numeric,
  default_interval_months numeric,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority text NOT NULL,
  service_type text NOT NULL,
  title text NOT NULL
);

ALTER TABLE public.maintenance_intervals ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
