-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.assets
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.assets (
  asset_type text NOT NULL,
  bucket text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  duration_seconds numeric,
  file_size numeric NOT NULL,
  folder text,
  height numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime_type text NOT NULL,
  original_filename text NOT NULL,
  status text NOT NULL,
  storage_path text NOT NULL,
  tenant_id uuid,
  thumbnail_path text,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  width numeric
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assets' AND policyname='assets_re_owner_all') THEN
  CREATE POLICY assets_re_owner_all ON public.assets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
