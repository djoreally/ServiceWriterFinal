-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_ops_events
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_ops_events (
  actor_id uuid,
  actor_role text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  details jsonb,
  event_category text NOT NULL,
  event_type text NOT NULL,
  fleet_client_id uuid NOT NULL,
  fleet_purchase_order_id uuid,
  fleet_vehicle_id uuid,
  fleet_work_order_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_ops_events ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_ops_events' AND policyname='fleet_ops_events_re_owner_all') THEN
  CREATE POLICY fleet_ops_events_re_owner_all ON public.fleet_ops_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_ops_events_fleet_client_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_ops_events ADD CONSTRAINT fleet_ops_events_fleet_client_id_fkey FOREIGN KEY (fleet_client_id) REFERENCES public.fleet_clients (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_ops_events_fleet_client_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_ops_events_fleet_purchase_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_ops_events ADD CONSTRAINT fleet_ops_events_fleet_purchase_order_id_fkey FOREIGN KEY (fleet_purchase_order_id) REFERENCES public.fleet_purchase_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_ops_events_fleet_purchase_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_ops_events_fleet_vehicle_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_ops_events ADD CONSTRAINT fleet_ops_events_fleet_vehicle_id_fkey FOREIGN KEY (fleet_vehicle_id) REFERENCES public.fleet_vehicles (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_ops_events_fleet_vehicle_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_ops_events_fleet_work_order_id_fkey') THEN
    BEGIN
      ALTER TABLE public.fleet_ops_events ADD CONSTRAINT fleet_ops_events_fleet_work_order_id_fkey FOREIGN KEY (fleet_work_order_id) REFERENCES public.fleet_work_orders (id);
    EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'reverse-engineered migration: FK fleet_ops_events_fleet_work_order_id_fkey skipped (%)', SQLERRM;
    END;
  END IF;
END
$do$;
