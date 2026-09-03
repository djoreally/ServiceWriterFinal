create or replace function public.populate_user_service_packages(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  template_row record;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  for template_row in
    select id, name, description, discount_type, discount_value, estimated_duration
    from public.service_package_templates
    where coalesce(is_active, true)
    order by coalesce(sort_order, 0), name
  loop
    insert into public.service_packages
      (user_id, name, description, package_price, discount_type, discount_value, estimated_duration, is_active)
    select p_user_id, template_row.name, template_row.description, 0,
           template_row.discount_type, template_row.discount_value,
           template_row.estimated_duration, true
    where not exists (
      select 1 from public.service_packages p
      where p.user_id = p_user_id and lower(p.name) = lower(template_row.name)
    );
    inserted_count := inserted_count + case when found then 1 else 0 end;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.populate_user_service_packages(uuid) from public, anon;
grant execute on function public.populate_user_service_packages(uuid) to authenticated;
