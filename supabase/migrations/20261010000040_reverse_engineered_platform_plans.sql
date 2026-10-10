-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.platform_plans
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.platform_plans (
  badge_color text,
  badge_label text,
  billing_interval text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  display_name text NOT NULL,
  display_order numeric NOT NULL,
  has_ai_assistant boolean NOT NULL,
  has_ai_routing boolean NOT NULL,
  has_carfax_integration boolean NOT NULL,
  has_dispatch_engine boolean NOT NULL,
  has_fleet_os boolean NOT NULL,
  has_invoicing_basic boolean NOT NULL,
  has_invoicing_full boolean NOT NULL,
  has_marketing_automation boolean NOT NULL,
  has_public_booking boolean NOT NULL,
  has_pwa_offline boolean NOT NULL,
  has_quickbooks_sync boolean NOT NULL,
  has_stripe_payments boolean NOT NULL,
  has_technician_os boolean NOT NULL,
  highlight boolean NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL,
  is_contact_sales boolean NOT NULL,
  max_appointments_per_month numeric,
  max_customers numeric,
  max_technician_seats numeric,
  min_platform_fee_cents numeric NOT NULL,
  name text NOT NULL,
  platform_fee_bps numeric NOT NULL,
  price_cents numeric NOT NULL,
  stripe_price_id uuid,
  stripe_product_id uuid,
  support_level text,
  tax_compliance_level text,
  trial_period_days numeric NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
