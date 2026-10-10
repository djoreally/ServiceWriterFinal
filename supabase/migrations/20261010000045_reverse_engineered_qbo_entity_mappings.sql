-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.qbo_entity_mappings
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.qbo_entity_mappings (
  created_at timestamptz DEFAULT now(),
  entity_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_synced_at timestamptz,
  local_id uuid NOT NULL,
  qbo_id uuid NOT NULL,
  sync_error text,
  sync_status text,
  updated_at timestamptz,
  user_id uuid NOT NULL
);

ALTER TABLE public.qbo_entity_mappings ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qbo_entity_mappings' AND policyname='qbo_entity_mappings_re_owner_all') THEN
  CREATE POLICY qbo_entity_mappings_re_owner_all ON public.qbo_entity_mappings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
