-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.weather_risk_logs
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.weather_risk_logs (
  appointment_id uuid NOT NULL,
  decision text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text,
  risk_level text NOT NULL,
  risk_score numeric NOT NULL,
  snapshot_id uuid,
  user_id uuid NOT NULL
);

ALTER TABLE public.weather_risk_logs ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='weather_risk_logs' AND policyname='weather_risk_logs_re_owner_all') THEN
  CREATE POLICY weather_risk_logs_re_owner_all ON public.weather_risk_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weather_risk_logs_appointment_id_fkey') THEN
    BEGIN
      ALTER TABLE public.weather_risk_logs ADD CONSTRAINT weather_risk_logs_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK weather_risk_logs_appointment_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weather_risk_logs_snapshot_id_fkey') THEN
    BEGIN
      ALTER TABLE public.weather_risk_logs ADD CONSTRAINT weather_risk_logs_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weather_snapshots (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK weather_risk_logs_snapshot_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
