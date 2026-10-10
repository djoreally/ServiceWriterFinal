-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.subscription_plan_templates
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.subscription_plan_templates (
  badge_color text,
  badge_label text,
  billing_cycle text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  cta_label text,
  description text,
  display_order numeric NOT NULL,
  features jsonb NOT NULL,
  highlight boolean NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  included_services_description jsonb NOT NULL,
  is_active boolean NOT NULL,
  max_services_per_cycle numeric,
  name text NOT NULL,
  price numeric NOT NULL,
  price_max numeric,
  price_min numeric,
  tier text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.subscription_plan_templates ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
