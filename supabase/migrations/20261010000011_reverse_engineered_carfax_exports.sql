-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.carfax_exports
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.carfax_exports (
  created_at timestamptz DEFAULT now() NOT NULL,
  error_message text,
  export_date text NOT NULL,
  export_type text NOT NULL,
  file_name text NOT NULL,
  ftp_uploaded_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_count numeric NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.carfax_exports ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='carfax_exports' AND policyname='carfax_exports_re_owner_all') THEN
  CREATE POLICY carfax_exports_re_owner_all ON public.carfax_exports FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
