-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_operation_batches
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_operation_batches (
  completed_at timestamptz,
  context jsonb NOT NULL,
  error_message text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text,
  operation_type text NOT NULL,
  retry_count numeric NOT NULL,
  started_at timestamptz NOT NULL,
  status text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_operation_batches ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_operation_batches' AND policyname='fleet_operation_batches_re_owner_all') THEN
  CREATE POLICY fleet_operation_batches_re_owner_all ON public.fleet_operation_batches FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
