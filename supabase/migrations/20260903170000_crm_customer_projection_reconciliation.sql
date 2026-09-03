-- Keep CRM as an asynchronous projection of canonical customers.
-- This function is service-role-only and idempotently inserts only missing
-- crm_profiles rows. Existing CRM lifecycle data is never overwritten.

create or replace function public.reconcile_crm_profiles_v1(p_workspace_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.crm_profiles (
    workspace_id,
    customer_id,
    lifecycle_stage,
    created_at,
    updated_at
  )
  select
    c.workspace_id,
    c.id,
    case when c.status = 'inactive' then 'inactive' else 'new' end,
    timezone('utc', now()),
    timezone('utc', now())
  from public.customers c
  where c.status <> 'archived'
    and (p_workspace_id is null or c.workspace_id = p_workspace_id)
  on conflict (workspace_id, customer_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.reconcile_crm_profiles_v1(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_crm_profiles_v1(uuid) to service_role;
