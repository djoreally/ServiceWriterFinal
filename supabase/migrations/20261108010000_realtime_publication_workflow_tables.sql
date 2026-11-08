-- Realtime: publish the workflow tables (2026-11-08, Fix 1)
--
-- The app's workflow realtime channel (useRealtimeWorkflow) subscribes to
-- appointments + service_records via postgres_changes, but the
-- supabase_realtime publication only contained in_app_notifications and
-- payment_provider_records — so the channel could never receive events and
-- the UI showed a permanent false "Offline" state (and no live sync).
--
-- The subscribed names "services" and "service_timeline" do not exist in
-- this database (the reverse-engineered migration that would have created
-- public.services never landed in production); the real tables are
-- appointments and service_records. The hook's bindings were corrected in
-- the same change.
--
-- Applied to production 2026-11-08 via the dashboard SQL editor and
-- verified: pg_publication_tables for supabase_realtime now lists
-- appointments, in_app_notifications, payment_provider_records,
-- service_records.

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments, public.service_records;
