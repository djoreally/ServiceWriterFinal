-- Financial writes must match the API billing roles rather than the broader
-- operational writer set. Viewers, technicians, dispatchers, fleet managers,
-- and customers retain only the read access granted by their existing policies.
create or replace function public.is_workspace_financial_writer(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.member_role,
      'admin'::public.member_role,
      'manager'::public.member_role,
      'service_advisor'::public.member_role,
      'receptionist'::public.member_role
    ]
  );
$$;

revoke all on function public.is_workspace_financial_writer(uuid) from public;
grant execute on function public.is_workspace_financial_writer(uuid) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['payments','invoices','invoice_lines','quotes']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_staff_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_staff_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_staff_delete', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_financial_writer(workspace_id))', table_name || '_staff_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_financial_writer(workspace_id)) with check (public.is_workspace_financial_writer(workspace_id))', table_name || '_staff_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_workspace_financial_writer(workspace_id))', table_name || '_staff_delete', table_name);
  end loop;
end $$;
