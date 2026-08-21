-- Tenant-configurable detailing modifiers and assessment photo storage.
CREATE TABLE IF NOT EXISTS public.detailing_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  service_id uuid,
  name text NOT NULL,
  price_multiplier numeric(8,4) NOT NULL DEFAULT 1,
  quote_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-assessment-photos', 'booking-assessment-photos', false)
ON CONFLICT (id) DO NOTHING;
