-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_po_ledger_entries
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_po_ledger_entries (
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  entry_type text NOT NULL,
  fleet_purchase_order_id uuid NOT NULL,
  fleet_work_order_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metadata jsonb NOT NULL,
  reason_code text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_po_ledger_entries ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_po_ledger_entries' AND policyname='fleet_po_ledger_entries_re_owner_all') THEN
  CREATE POLICY fleet_po_ledger_entries_re_owner_all ON public.fleet_po_ledger_entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_po_ledger_entries_fleet_purchase_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_po_ledger_entries ADD CONSTRAINT fleet_po_ledger_entries_fleet_purchase_order_id_fkey FOREIGN KEY (fleet_purchase_order_id) REFERENCES public.fleet_purchase_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_po_ledger_entries_fleet_purchase_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_po_ledger_entries_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_po_ledger_entries ADD CONSTRAINT fleet_po_ledger_entries_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_po_ledger_entries_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
