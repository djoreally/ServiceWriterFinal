-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.team_user_links
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.team_user_links (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid,
  member_user_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  role text NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE public.team_user_links ENABLE ROW LEVEL SECURITY;
-- No workspace_id/user_id scoping column inferred: RLS enabled with NO policies.
-- Copy the production policies for this table before relying on it.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_user_links_invitation_id_fkey') THEN
    BEGIN
      ALTER TABLE public.team_user_links ADD CONSTRAINT team_user_links_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.team_invitations (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK team_user_links_invitation_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
