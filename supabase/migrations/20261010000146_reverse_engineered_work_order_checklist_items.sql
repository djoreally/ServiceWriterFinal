-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.work_order_checklist_items
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.work_order_checklist_items (
  completed_at timestamptz,
  completed_by uuid,
  evidence_url text,
  execution_phase text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_mandatory boolean NOT NULL,
  is_unlocked boolean NOT NULL,
  notes text,
  playbook_id uuid,
  requires_photo boolean NOT NULL,
  status text NOT NULL,
  step_name text NOT NULL,
  step_order numeric NOT NULL,
  work_order_id uuid NOT NULL
);

ALTER TABLE public.work_order_checklist_items ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_checklist_items_playbook_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_checklist_items ADD CONSTRAINT work_order_checklist_items_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES public.service_playbooks (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_checklist_items_playbook_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_checklist_items_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.work_order_checklist_items ADD CONSTRAINT work_order_checklist_items_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK work_order_checklist_items_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
