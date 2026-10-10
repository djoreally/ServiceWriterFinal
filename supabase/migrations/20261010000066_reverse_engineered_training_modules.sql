-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.training_modules
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.training_modules (
  active boolean NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  currency text NOT NULL,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_cents numeric NOT NULL,
  slug text NOT NULL,
  sort_order numeric NOT NULL,
  surface text NOT NULL,
  title text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
