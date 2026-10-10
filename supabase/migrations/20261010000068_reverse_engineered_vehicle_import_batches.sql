-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.vehicle_import_batches
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.vehicle_import_batches (
  committed_rows numeric NOT NULL,
  context_payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  duplicate_rows numeric NOT NULL,
  error_rows numeric NOT NULL,
  headers_payload jsonb NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_payload jsonb NOT NULL,
  parsed_rows numeric NOT NULL,
  ready_rows numeric NOT NULL,
  source_file_name text NOT NULL,
  source_file_type text NOT NULL,
  status text NOT NULL,
  total_rows numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  warning_rows numeric NOT NULL
);

ALTER TABLE public.vehicle_import_batches ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
