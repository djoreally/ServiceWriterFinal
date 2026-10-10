-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.price_quote_requests
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.price_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text,
  quoted_price numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.price_quote_requests ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
