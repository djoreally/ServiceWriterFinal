-- Rollback/test companion for SERVICE_WRITER_SECURITY_HARDENING.sql
-- Review against the pre-migration policy export before use.
-- Do not run in production without an approved change window.

-- 1. Capture current ACLs and policy definitions before rollback.
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       coalesce(array_to_string(p.proacl, ';'), '') AS acl,
       coalesce(array_to_string(p.proconfig, ';'), '') AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, arguments;

-- 2. Negative privilege checks. All rows must be false except explicitly
-- approved public read-only booking functions.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, arguments;

-- 3. Verify client roles cannot read server-managed tables.
SELECT table_schema, table_name,
       has_table_privilege('anon', quote_ident(table_schema)||'.'||quote_ident(table_name), 'SELECT') AS anon_select,
       has_table_privilege('authenticated', quote_ident(table_schema)||'.'||quote_ident(table_name), 'SELECT') AS authenticated_select
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'lifecycle_event_outbox', 'in_app_notification_push_outbox',
    'webhook_events', 'message_delivery_events', 'inbound_messages',
    'audit_events', 'crm_audit_events', 'google_calendar_sync_tokens'
  )
ORDER BY table_name;

-- 4. Verify policies after hardening.
SELECT schemaname, tablename, policyname, roles, cmd,
       coalesce(qual, '') AS using_expression,
       coalesce(with_check, '') AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'audit_events', 'abandoned_bookings', 'tech_push_subscriptions',
    'lifecycle_event_outbox', 'in_app_notification_push_outbox'
  )
ORDER BY tablename, policyname;

-- 5. Optional rollback template. Replace grants/policies with the exact
-- pre-change definitions retained by change management. Never restore broad
-- grants from memory.
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.book_appointment_safe(...) TO anon, authenticated;
-- CREATE POLICY ...;
-- COMMIT;

-- 6. Required application-level tests (run from an isolated test harness):
-- a) anon RPC call to every non-allowlisted SECURITY DEFINER function -> 401/403
-- b) authenticated user in workspace A reads/writes workspace B -> zero rows/403
-- c) customer reads another customer’s child rows -> zero rows
-- d) technician updates unassigned work order -> 403/zero rows
-- e) browser reads token, webhook, inbound, audit, or outbox tables -> denied
-- f) public booking cannot supply arbitrary business_user_id to target another tenant
-- g) duplicate public booking retry with same idempotency context -> one appointment
-- h) notification and lifecycle workers retain service-role-only access
