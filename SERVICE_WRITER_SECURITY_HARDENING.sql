-- Service Writer security and privacy hardening package
-- Generated for review; NOT executed by this audit.
-- Target: Supabase/PostgreSQL production project.
-- Apply through a reviewed migration after application compatibility testing.
-- This script intentionally separates immediate privilege reduction from any
-- public-booking compatibility grants.

BEGIN;

-- ================================================================
-- 0. PRE-FLIGHT: inspect before changing anything
-- ================================================================
-- Run these SELECTs independently in staging first and retain the output.
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       coalesce(array_to_string(p.proconfig, ';'), '') AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname, arguments;

SELECT schemaname, tablename, policyname, roles, cmd,
       coalesce(qual, '') AS using_expression,
       coalesce(with_check, '') AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ================================================================
-- 1. SECURITY DEFINER privilege reduction
-- ================================================================
-- Remove default/public, anonymous, and authenticated EXECUTE from every
-- SECURITY DEFINER function in public. This closes accidental RPC exposure.
-- The explicit allowlist below restores only functions whose caller contract
-- is intentionally public or authenticated. All other functions become
-- server/worker-only and must be invoked through a protected API route.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.signature);
  END LOOP;
END $$;

-- Worker-only database functions. Keep service_role access explicit rather
-- than relying on default grants.
GRANT EXECUTE ON FUNCTION public.claim_in_app_push_outbox(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_in_app_push_outbox(uuid, text, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_lifecycle_events(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_lifecycle_event(uuid, text, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_in_app_notification_pushes() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_event(uuid, text, text, uuid, text, citext, text, jsonb) TO service_role;

-- Public read-only booking allowlist. These functions must return only fields
-- explicitly intended for public booking and must derive visibility from the
-- validated booking slug/context. Keep the function bodies under review.
GRANT EXECUTE ON FUNCTION public.get_public_booking_profile_v2(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_settings(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_catalog(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_catalog_v2(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_packages(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booked_slots(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_blocked_dates(uuid, uuid) TO anon, authenticated;

-- Temporary authenticated-only compatibility grants. Remove these after the
-- application is migrated to protected server routes/private helper schema.
GRANT EXECUTE ON FUNCTION public.complete_appointment_v1(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_technician(uuid, uuid) TO authenticated;

-- Deliberately NOT granted to anon/authenticated. These mutation RPCs must be
-- called only by a protected server route using service_role or a tightly
-- checked authenticated route:
--   book_appointment_safe
--   insert_booking_appointment_services
--   record_public_booking_payment_intent_v1
--   save_appointment_booking_configuration
--   set_vehicle_tire_spec_v1
--   upsert_booking_vehicle
--   upsert_customer
--   populate_user_service_packages
--
-- After the route migration, grant only service_role to their exact signatures.
-- Do not grant service_role to browser clients.

-- ================================================================
-- 2. SECURITY DEFINER search_path hardening for reviewed functions
-- ================================================================
-- These bodies were inspected as using fully qualified public references in
-- the current production definition. Keep search_path empty to prevent name
-- resolution through attacker-controlled schemas. Re-run function tests after
-- this change. Functions not yet verified remain unchanged until reviewed.
ALTER FUNCTION public.book_appointment_safe(uuid, date, time, integer, text, text, text, text, text, text, numeric, numeric, uuid, uuid, text)
  SET search_path = '';
ALTER FUNCTION public.complete_appointment_v1(uuid, uuid)
  SET search_path = '';
ALTER FUNCTION public.claim_in_app_push_outbox(integer, text)
  SET search_path = '';
ALTER FUNCTION public.complete_in_app_push_outbox(uuid, text, boolean, text, integer)
  SET search_path = '';
ALTER FUNCTION public.claim_lifecycle_events(integer, text)
  SET search_path = '';
ALTER FUNCTION public.complete_lifecycle_event(uuid, text, boolean, text, integer)
  SET search_path = '';
ALTER FUNCTION public.enqueue_in_app_notification_pushes()
  SET search_path = '';
ALTER FUNCTION public.enqueue_lifecycle_event(uuid, text, text, uuid, text, citext, text, jsonb)
  SET search_path = '';

-- ================================================================
-- 3. RLS and direct-table hardening
-- ================================================================
-- Internal delivery/outbox and provider callback records must not be read or
-- mutated directly by browser roles. Server workers use service_role.
REVOKE ALL ON TABLE public.lifecycle_event_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.in_app_notification_push_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.message_delivery_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inbound_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_audit_events FROM PUBLIC, anon, authenticated;

-- Calendar access/refresh tokens are server-managed secrets. Browser clients
-- must use a protected integration endpoint, never select token columns.
REVOKE ALL ON TABLE public.google_calendar_sync_tokens FROM PUBLIC, anon, authenticated;

-- Preserve worker/service access after the client revocation.
GRANT ALL ON TABLE public.lifecycle_event_outbox TO service_role;
GRANT ALL ON TABLE public.in_app_notification_push_outbox TO service_role;
GRANT ALL ON TABLE public.webhook_events TO service_role;
GRANT ALL ON TABLE public.message_delivery_events TO service_role;
GRANT ALL ON TABLE public.inbound_messages TO service_role;
GRANT ALL ON TABLE public.audit_events TO service_role;
GRANT ALL ON TABLE public.crm_audit_events TO service_role;
GRANT ALL ON TABLE public.google_calendar_sync_tokens TO service_role;

-- RLS remains enabled and default-deny for client roles after REVOKE.
ALTER TABLE public.lifecycle_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notification_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_sync_tokens ENABLE ROW LEVEL SECURITY;

-- Remove the unsafe global-audit exception: workspace-less audit rows must not
-- be visible to every authenticated user. Server-side admin tooling should
-- read them with service_role or a dedicated, reviewed admin view.
DROP POLICY IF EXISTS audit_events_staff_select ON public.audit_events;
CREATE POLICY audit_events_staff_select
  ON public.audit_events
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_staff(workspace_id));

-- Remove anonymous session-only mutation of abandoned bookings. A non-null
-- session_id is not proof that the caller owns the session. Replace this with
-- a server endpoint that binds a signed, expiring recovery token.
DROP POLICY IF EXISTS abandoned_bookings_public_update_by_session ON public.abandoned_bookings;
REVOKE UPDATE ON TABLE public.abandoned_bookings FROM anon;

-- Anonymous abandoned-booking inserts must not accept an arbitrary user_id.
-- Authenticated recovery/ownership writes should use a protected route.
DROP POLICY IF EXISTS abandoned_bookings_public_insert ON public.abandoned_bookings;
CREATE POLICY abandoned_bookings_public_insert
  ON public.abandoned_bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL);

-- Push subscription rows may remain user-owned, but never allow a client to
-- attach a subscription to a workspace where it is not staff. The current
-- nullable-workspace design is retained for personal subscriptions.
DROP POLICY IF EXISTS tech_push_subscriptions_insert_own ON public.tech_push_subscriptions;
CREATE POLICY tech_push_subscriptions_insert_own
  ON public.tech_push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_staff(workspace_id))
  );

-- ================================================================
-- 4. Validation queries: run after migration and save as evidence
-- ================================================================
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       coalesce(array_to_string(p.proconfig, ';'), '') AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname, arguments;

SELECT schemaname, tablename, policyname, roles, cmd,
       coalesce(qual, '') AS using_expression,
       coalesce(with_check, '') AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'audit_events', 'abandoned_bookings', 'lifecycle_event_outbox',
    'in_app_notification_push_outbox', 'tech_push_subscriptions'
  )
ORDER BY tablename, policyname;

COMMIT;

-- ================================================================
-- 5. RETENTION DRY-RUN QUERIES (do not delete until policy approval)
-- ================================================================
-- Replace the intervals with approved policy values. These are intentionally
-- SELECT-only previews. Deletion/anonymization must run through a reviewed,
-- audited service job with legal-hold exceptions and a completion log.
SELECT 'abandoned_bookings' AS table_name, count(*) AS candidates
FROM public.abandoned_bookings
WHERE created_at < now() - interval '90 days'
  AND recovered IS NOT TRUE;

SELECT 'message_delivery_events' AS table_name, count(*) AS candidates
FROM public.message_delivery_events
WHERE received_at < now() - interval '400 days';

SELECT 'webhook_events' AS table_name, count(*) AS candidates
FROM public.webhook_events
WHERE received_at < now() - interval '180 days'
  AND status IN ('processed', 'failed');

SELECT 'in_app_notification_push_outbox' AS table_name, count(*) AS candidates
FROM public.in_app_notification_push_outbox
WHERE created_at < now() - interval '90 days'
  AND status IN ('sent', 'discarded');

SELECT 'lifecycle_event_outbox' AS table_name, count(*) AS candidates
FROM public.lifecycle_event_outbox
WHERE created_at < now() - interval '180 days'
  AND status IN ('sent', 'dead_letter');

-- Do not purge raw inbound/message payloads until the organization approves a
-- retention schedule, legal-hold process, customer-rights process, and vendor
-- contract/subprocessor review.
