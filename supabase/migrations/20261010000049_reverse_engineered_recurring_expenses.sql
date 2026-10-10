-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.recurring_expenses
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  amount numeric NOT NULL,
  autopost boolean NOT NULL,
  category_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  day_of_month numeric,
  end_date text,
  frequency text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interval_count numeric NOT NULL,
  is_active boolean NOT NULL,
  last_generated_at timestamptz,
  last_generated_expense_id uuid,
  last4 text,
  name text NOT NULL,
  next_due_date text NOT NULL,
  notes text,
  payment_method text,
  start_date text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vendor_id uuid,
  vendor_name text NOT NULL
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recurring_expenses' AND policyname='recurring_expenses_re_owner_all') THEN
  CREATE POLICY recurring_expenses_re_owner_all ON public.recurring_expenses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expenses_category_id_fkey') THEN
    BEGIN
      ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK recurring_expenses_category_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expenses_vendor_id_fkey') THEN
    BEGIN
      ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK recurring_expenses_vendor_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
