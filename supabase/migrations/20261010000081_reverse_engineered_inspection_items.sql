-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.inspection_items
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.inspection_items (
  category text,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_required boolean,
  name text NOT NULL,
  sort_order numeric,
  template_id uuid NOT NULL
);

ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspection_items_template_id_fkey') THEN
    BEGIN
      ALTER TABLE public.inspection_items ADD CONSTRAINT inspection_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.inspection_templates (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK inspection_items_template_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
