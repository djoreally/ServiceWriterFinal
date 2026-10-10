-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.service_catalog
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.service_catalog (
  allows_manual_fitment boolean NOT NULL,
  category text,
  category_id uuid,
  configuration_schema_version numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  default_price numeric NOT NULL,
  description text,
  estimated_duration numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_template_id uuid,
  is_active boolean NOT NULL,
  is_upsell boolean NOT NULL,
  labor_rate numeric,
  name text NOT NULL,
  notes text,
  parts_required text,
  pricing_mode text NOT NULL,
  requires_fitment_lookup boolean NOT NULL,
  requires_inventory_selection boolean NOT NULL,
  requires_tire_quantity boolean NOT NULL,
  service_intent text,
  service_vertical text NOT NULL,
  skill_level text,
  sort_order numeric,
  template_id uuid,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_catalog' AND policyname='service_catalog_re_owner_all') THEN
  CREATE POLICY service_catalog_re_owner_all ON public.service_catalog FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_category_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_catalog ADD CONSTRAINT service_catalog_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.service_categories (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_catalog_category_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_inspection_template_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_catalog ADD CONSTRAINT service_catalog_inspection_template_id_fkey FOREIGN KEY (inspection_template_id) REFERENCES public.inspection_templates (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_catalog_inspection_template_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_template_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_catalog ADD CONSTRAINT service_catalog_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.service_templates (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_catalog_template_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
