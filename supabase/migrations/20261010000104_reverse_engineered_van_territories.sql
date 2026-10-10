-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.van_territories
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.van_territories (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_primary boolean NOT NULL,
  van_id uuid NOT NULL,
  zip_code text NOT NULL
);

ALTER TABLE public.van_territories ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'van_territories_van_id_fkey') THEN
    BEGIN
      ALTER TABLE public.van_territories ADD CONSTRAINT van_territories_van_id_fkey FOREIGN KEY (van_id) REFERENCES public.vans (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK van_territories_van_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
