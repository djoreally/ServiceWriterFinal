-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.qbo_sync_log
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.qbo_sync_log (
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  direction text NOT NULL,
  entity_type text,
  error_details jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  records_failed numeric,
  records_synced numeric,
  started_at timestamptz,
  status text NOT NULL,
  sync_type text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.qbo_sync_log ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qbo_sync_log' AND policyname='qbo_sync_log_re_owner_all') THEN
  CREATE POLICY qbo_sync_log_re_owner_all ON public.qbo_sync_log FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
