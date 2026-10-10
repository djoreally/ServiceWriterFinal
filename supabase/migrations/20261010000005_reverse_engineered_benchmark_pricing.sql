-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.benchmark_pricing
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.benchmark_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text,
  vehicle_type text,
  low_price numeric,
  average_price numeric,
  high_price numeric,
  data_source text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.benchmark_pricing ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
