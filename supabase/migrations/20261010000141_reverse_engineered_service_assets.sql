-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.service_assets
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.service_assets (
  asset_id uuid NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.service_assets ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_assets' AND policyname='service_assets_re_owner_all') THEN
  CREATE POLICY service_assets_re_owner_all ON public.service_assets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_assets_asset_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_assets ADD CONSTRAINT service_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_assets_asset_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_assets_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_assets ADD CONSTRAINT service_assets_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_assets_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
