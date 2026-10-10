-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.invoice_lifecycle_events
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.invoice_lifecycle_events (
  amount numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  details jsonb NOT NULL,
  event_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text,
  invoice_id uuid NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.invoice_lifecycle_events ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_lifecycle_events' AND policyname='invoice_lifecycle_events_re_owner_all') THEN
  CREATE POLICY invoice_lifecycle_events_re_owner_all ON public.invoice_lifecycle_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lifecycle_events_invoice_id_fkey') THEN
    BEGIN
      ALTER TABLE public.invoice_lifecycle_events ADD CONSTRAINT invoice_lifecycle_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK invoice_lifecycle_events_invoice_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
