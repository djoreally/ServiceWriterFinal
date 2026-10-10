-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.billing_price_catalog
-- Source of column list: code references (select/insert/update/upsert/onConflict + zod/TS types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.billing_price_catalog (
  catalog_key text NOT NULL,
  component text,
  plan_tier text,
  billing_interval text,
  unit_amount_cents integer,
  stripe_product_id text,
  stripe_price_id text,
  active boolean,
  UNIQUE (catalog_key)
);

ALTER TABLE public.billing_price_catalog ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
