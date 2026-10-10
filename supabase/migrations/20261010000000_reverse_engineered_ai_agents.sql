-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.ai_agents
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.ai_agents (
  avatar text,
  capabilities jsonb NOT NULL,
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  display_order numeric NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL,
  model text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  slug text NOT NULL,
  system_prompt text NOT NULL,
  temperature numeric NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
