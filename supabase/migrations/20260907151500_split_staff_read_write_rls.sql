-- Preserve read access for active workspace viewers while preventing direct
-- Data API mutations from bypassing the role checks enforced by Next.js APIs.
create or replace function public.is_workspace_writer(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role not in ('viewer'::public.member_role, 'customer'::public.member_role)
  );
$$;

revoke all on function public.is_workspace_writer(uuid) from public;
grant execute on function public.is_workspace_writer(uuid) to authenticated, service_role;

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('appointment_items','appointment_items_staff_all'),
      ('appointments','appointments_staff_all'),
      ('customers','customers_staff_all'),
      ('dispatch_events','dispatch_events_staff_all'),
      ('filter_catalog','filter_catalog_staff_all'),
      ('invoice_lines','invoice_lines_staff_all'),
      ('invoices','invoices_staff_all'),
      ('locations','locations_staff_all'),
      ('payments','payments_staff_all'),
      ('quotes','quotes_staff_all'),
      ('service_catalog','catalog_staff_all'),
      ('service_records','service_records_staff_all'),
      ('vehicle_service_specs','vehicle_service_specs_staff_all'),
      ('vehicles','vehicles_staff_all'),
      ('work_order_assignments','assignments_staff_all'),
      ('work_order_events','work_order_events_staff_all'),
      ('work_order_items','work_order_items_staff_all'),
      ('work_orders','work_orders_staff_all')
    ) as policies(table_name, old_policy)
  loop
    execute format('drop policy if exists %I on public.%I', rec.old_policy, rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_staff_select', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_staff_insert', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_staff_update', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_staff_delete', rec.table_name);

    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_staff(workspace_id))', rec.table_name || '_staff_select', rec.table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_writer(workspace_id))', rec.table_name || '_staff_insert', rec.table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id))', rec.table_name || '_staff_update', rec.table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_workspace_writer(workspace_id))', rec.table_name || '_staff_delete', rec.table_name);
  end loop;
end $$;
