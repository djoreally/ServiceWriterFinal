-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.cash_drawer_events
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.cash_drawer_events (
  actual_amount numeric,
  amount numeric,
  appointment_id uuid,
  created_at timestamptz DEFAULT now(),
  device_info jsonb,
  event_type text NOT NULL,
  expected_amount numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by uuid,
  payment_id uuid,
  payment_method text,
  reason text,
  trigger_type text NOT NULL,
  user_id uuid NOT NULL,
  variance numeric
);

ALTER TABLE public.cash_drawer_events ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_drawer_events' AND policyname='cash_drawer_events_re_owner_all') THEN
  CREATE POLICY cash_drawer_events_re_owner_all ON public.cash_drawer_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
