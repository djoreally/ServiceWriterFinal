-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.filter_cross_references
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.filter_cross_references (
  confidence_score numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  filter_type text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  source_brand text NOT NULL,
  source_part_number text NOT NULL,
  target_brand text NOT NULL,
  target_part_number text NOT NULL
);

ALTER TABLE public.filter_cross_references ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
