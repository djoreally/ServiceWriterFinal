-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.service_reminders
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.service_reminders (
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_service_date text,
  last_service_id uuid,
  mileage_interval numeric,
  reminder_date text NOT NULL,
  sent_at timestamptz,
  service_type text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL,
  vehicle_id uuid
);

ALTER TABLE public.service_reminders ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_reminders' AND policyname='service_reminders_re_owner_all') THEN
  CREATE POLICY service_reminders_re_owner_all ON public.service_reminders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_reminders_customer_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_reminders ADD CONSTRAINT service_reminders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_reminders_customer_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_reminders_last_service_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_reminders ADD CONSTRAINT service_reminders_last_service_id_fkey FOREIGN KEY (last_service_id) REFERENCES public.services (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_reminders_last_service_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_reminders_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.service_reminders ADD CONSTRAINT service_reminders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK service_reminders_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
