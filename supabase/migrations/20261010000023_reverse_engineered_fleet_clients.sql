-- REVERSE-ENGINEERED from code references -- VERIFY against production before applying. Generated 2026-10-10.
-- Table: public.fleet_clients
-- Source of column list: src/integrations/supabase/types.ts (generated DB types)
-- Approximations: text/uuid/varchar collapsed per naming convention (id,*_id,*_by->uuid, *_at->timestamptz, else text);
--   number->numeric, Json->jsonb, enums collapsed to text. Defaults/constraints beyond PK/UNIQUE below are unknown.

CREATE TABLE IF NOT EXISTS public.fleet_clients (
  address text,
  address_line_2 text,
  ap_contact_email text,
  ap_contact_name text,
  ap_contact_phone text,
  auto_approve_threshold numeric,
  billing_email text,
  billing_notes text,
  booking_slug text,
  city text,
  communication_preference text NOT NULL,
  company_name text NOT NULL,
  contract_end_date text,
  contract_start_date text,
  created_at timestamptz DEFAULT now() NOT NULL,
  credit_status text NOT NULL,
  default_pricing_tier text NOT NULL,
  deleted_at timestamptz,
  fleet_manager_email text,
  fleet_manager_name text,
  fleet_manager_phone text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_email_local_part text,
  internal_notes text,
  invoice_format text,
  monthly_vehicle_count numeric,
  notes text,
  payment_terms text NOT NULL,
  phone text,
  portal_access_enabled boolean NOT NULL,
  postal_code text,
  region text,
  requires_notes_format boolean NOT NULL,
  requires_photos boolean NOT NULL,
  requires_po boolean NOT NULL,
  service_notes text,
  state text,
  status text NOT NULL,
  tax_exempt boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.fleet_clients ENABLE ROW LEVEL SECURITY;
-- Scoping inferred from user_id column: owner-only access (repo idiom: user_id = auth.uid()).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleet_clients' AND policyname='fleet_clients_re_owner_all') THEN
  CREATE POLICY fleet_clients_re_owner_all ON public.fleet_clients FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$do$;
