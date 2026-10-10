-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.visitor_presence
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.visitor_presence (
  browser text,
  connected_at timestamptz NOT NULL,
  country text,
  created_at timestamptz DEFAULT now() NOT NULL,
  current_path text,
  device_type text,
  disconnected_at timestamptz,
  heartbeat_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_activity_at timestamptz NOT NULL,
  primary_tab boolean NOT NULL,
  referrer text,
  session_id uuid NOT NULL,
  state text NOT NULL,
  tenant_id uuid NOT NULL,
  visitor_id uuid NOT NULL
);

ALTER TABLE public.visitor_presence ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
