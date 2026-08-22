-- Broader workflow RLS coverage.
-- Public booking must use an explicitly approved RPC/API boundary; anonymous clients
-- must not receive direct CRUD access to tenant tables.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'vehicles',
    'appointments',
    'quotes',
    'invoices',
    'payments',
    'fleet_clients',
    'fleet_client_contacts',
    'fleet_contracts',
    'fleet_service_requests',
    'fleet_dispatch_assignments',
    'service_records',
    'dispatch_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, public', table_name);
    execute format('grant select, insert, update, delete, references on table public.%I to authenticated', table_name);
  end loop;
end $$;

comment on schema public is 'Public base-table access is fail-closed for anonymous clients; public booking must use explicit safe RPC/API contracts.';
