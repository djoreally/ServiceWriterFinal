-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.filter_applications
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.filter_applications (
  brand text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  engine text NOT NULL,
  engine_code text,
  filter_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make text NOT NULL,
  model text NOT NULL,
  notes text,
  oem_number text,
  part_number text NOT NULL,
  part_number_alt text,
  updated_at timestamptz NOT NULL,
  year_end numeric NOT NULL,
  year_start numeric NOT NULL
);

ALTER TABLE public.filter_applications ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
