-- Migration: Backfill 8 tables found in production but missing from repo migrations
-- Verified against live production (rjfbrfognxqkyhdrpibx) on 2026-10-10
-- These tables exist in prod; this migration makes the repo able to rebuild them.
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE).

-- Ensure citext extension for fleet_client_contacts.email
CREATE EXTENSION IF NOT EXISTS citext;

-- Event sourcing tables
CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  aggregate_type varchar NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar NOT NULL,
  event_version integer NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  trace_id varchar NULL,
  correlation_id uuid NULL,
  causation_id uuid NULL,
  idempotency_key varchar NOT NULL,
  CONSTRAINT domain_events_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.event_deliveries (
  event_id uuid NOT NULL PRIMARY KEY,
  status public.event_delivery_status NOT NULL,
  available_at timestamptz NOT NULL,
  locked_at timestamptz NULL,
  locked_by varchar NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text NULL,
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.event_consumer_executions (
  event_id uuid NOT NULL,
  consumer_name varchar NOT NULL,
  status public.event_consumer_status NOT NULL,
  external_idempotency_key varchar NULL,
  provider_reference text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  PRIMARY KEY (event_id, consumer_name)
);

-- Filter catalog (oil filter parts)
CREATE TABLE IF NOT EXISTS public.filter_catalog (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  brand public.filter_brand NOT NULL,
  filter_type public.filter_type NOT NULL,
  part_number text NOT NULL,
  description text NULL,
  unit_price numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fleet tables
CREATE TABLE IF NOT EXISTS public.fleet_client_contacts (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  fleet_client_id uuid NOT NULL,
  name text NOT NULL,
  email citext NULL,
  phone text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_dispatch_assignments (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  service_request_id uuid NOT NULL,
  work_order_id uuid NULL,
  technician_id uuid NOT NULL,
  scheduled_start timestamptz NULL,
  scheduled_end timestamptz NULL,
  status text NOT NULL DEFAULT 'assigned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Work order tables
CREATE TABLE IF NOT EXISTS public.work_order_events (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  from_status public.work_order_status NULL,
  to_status public.work_order_status NOT NULL,
  actor_id uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_items (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  service_id uuid NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  is_billable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_domain_events_workspace ON public.domain_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate ON public.domain_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_deliveries_status ON public.event_deliveries (status, available_at);
CREATE INDEX IF NOT EXISTS idx_fleet_dispatch_ws ON public.fleet_dispatch_assignments (workspace_id);
CREATE INDEX IF NOT EXISTS idx_fleet_dispatch_tech ON public.fleet_dispatch_assignments (technician_id);
CREATE INDEX IF NOT EXISTS idx_work_order_events_wo ON public.work_order_events (work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_wo ON public.work_order_items (work_order_id);
