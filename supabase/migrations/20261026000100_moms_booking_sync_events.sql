-- Idempotency ledger for trusted MOMS -> Service Writer booking sync.
CREATE TABLE IF NOT EXISTS public.moms_booking_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_booking_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','failed','synced')),
  customer_id uuid,
  vehicle_id uuid,
  appointment_id uuid,
  service_lines_synced boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  last_error text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);
CREATE INDEX IF NOT EXISTS moms_booking_sync_events_status_idx
  ON public.moms_booking_sync_events(status, updated_at);
ALTER TABLE public.moms_booking_sync_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moms_booking_sync_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.moms_booking_sync_events TO service_role;
