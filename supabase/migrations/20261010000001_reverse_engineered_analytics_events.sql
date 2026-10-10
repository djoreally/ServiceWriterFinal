-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.analytics_events
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  created_at timestamptz DEFAULT now() NOT NULL,
  event_name text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metadata jsonb NOT NULL,
  session_id uuid NOT NULL,
  tenant_id uuid NOT NULL
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
