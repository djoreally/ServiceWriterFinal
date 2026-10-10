-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.message_bundles
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.message_bundles (
  bundle_key text,
  channel text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  credit_units numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  included_units numeric NOT NULL,
  is_active boolean NOT NULL,
  name text NOT NULL,
  price_cents numeric NOT NULL,
  renewal_period text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.message_bundles ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
