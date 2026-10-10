-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.newsletter_templates
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.newsletter_templates (
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  holiday_theme text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean,
  month_number numeric NOT NULL,
  preview_text text,
  seasonal_theme text,
  sequence_id uuid,
  subject text NOT NULL,
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.newsletter_templates ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='newsletter_templates' AND policyname='newsletter_templates_re_owner_all') THEN
  CREATE POLICY newsletter_templates_re_owner_all ON public.newsletter_templates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_templates_sequence_id_fkey') THEN
    BEGIN
      ALTER TABLE public.newsletter_templates ADD CONSTRAINT newsletter_templates_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.newsletter_sequences (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK newsletter_templates_sequence_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
