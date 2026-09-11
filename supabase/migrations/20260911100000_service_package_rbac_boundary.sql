-- Shot 9: restrict service-package mutation to catalog-management roles.
-- Prepared detached from main; apply only with the final certified release.

begin;

drop policy if exists service_packages_member_insert on public.service_packages;
create policy service_packages_manager_insert
on public.service_packages
for insert to authenticated
with check (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists service_packages_member_update on public.service_packages;
create policy service_packages_manager_update
on public.service_packages
for update to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
)
with check (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists service_packages_member_delete on public.service_packages;
create policy service_packages_manager_delete
on public.service_packages
for delete to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists service_package_items_member_insert on public.service_package_items;
create policy service_package_items_manager_insert
on public.service_package_items
for insert to authenticated
with check (
  exists (
    select 1
    from public.service_packages p
    where p.id = package_id
      and public.has_workspace_role(
        p.workspace_id,
        array['owner','admin','manager','service_advisor']::public.member_role[]
      )
  )
);

drop policy if exists service_package_items_member_update on public.service_package_items;
create policy service_package_items_manager_update
on public.service_package_items
for update to authenticated
using (
  exists (
    select 1
    from public.service_packages p
    where p.id = package_id
      and public.has_workspace_role(
        p.workspace_id,
        array['owner','admin','manager','service_advisor']::public.member_role[]
      )
  )
)
with check (
  exists (
    select 1
    from public.service_packages p
    where p.id = package_id
      and public.has_workspace_role(
        p.workspace_id,
        array['owner','admin','manager','service_advisor']::public.member_role[]
      )
  )
);

drop policy if exists service_package_items_member_delete on public.service_package_items;
create policy service_package_items_manager_delete
on public.service_package_items
for delete to authenticated
using (
  exists (
    select 1
    from public.service_packages p
    where p.id = package_id
      and public.has_workspace_role(
        p.workspace_id,
        array['owner','admin','manager','service_advisor']::public.member_role[]
      )
  )
);

create or replace function public.upsert_service_package(
  p_workspace_id uuid,p_name text,p_description text,p_package_price numeric,p_discount_type text,p_discount_value numeric,
  p_is_active boolean,p_estimated_duration integer,p_items jsonb,p_package_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path=''
as $function$
declare v_package_id uuid; v_item jsonb;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  ) then
    raise exception 'Catalog management permission required' using errcode='42501';
  end if;
  if p_package_id is null then
    insert into public.service_packages(workspace_id,name,description,package_price,discount_type,discount_value,is_active,estimated_duration,created_by)
    values(p_workspace_id,trim(p_name),p_description,coalesce(p_package_price,0),coalesce(nullif(p_discount_type,''),'fixed'),coalesce(p_discount_value,0),coalesce(p_is_active,true),p_estimated_duration,auth.uid())
    returning id into v_package_id;
  else
    update public.service_packages
    set name=trim(p_name),description=p_description,package_price=coalesce(p_package_price,0),discount_type=coalesce(nullif(p_discount_type,''),'fixed'),discount_value=coalesce(p_discount_value,0),is_active=coalesce(p_is_active,true),estimated_duration=p_estimated_duration,updated_at=now()
    where id=p_package_id and workspace_id=p_workspace_id
    returning id into v_package_id;
    if v_package_id is null then raise exception 'Package not found'; end if;
    delete from public.service_package_items where package_id=v_package_id;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if not exists(
      select 1
      from public.service_catalog sc
      where sc.id=(v_item->>'service_catalog_id')::uuid
        and sc.workspace_id=p_workspace_id
    ) then
      raise exception 'Service catalog item is not in this workspace';
    end if;
    insert into public.service_package_items(package_id,service_catalog_id,quantity,override_price)
    values(
      v_package_id,
      (v_item->>'service_catalog_id')::uuid,
      greatest(1,coalesce((v_item->>'quantity')::integer,1)),
      nullif(v_item->>'override_price','')::numeric
    );
  end loop;
  return v_package_id;
end;
$function$;

create or replace function public.populate_workspace_service_packages(p_workspace_id uuid)
returns integer
language plpgsql
security invoker
set search_path=''
as $function$
declare v_count integer;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  ) then
    raise exception 'Catalog management permission required' using errcode='42501';
  end if;
  insert into public.service_packages(workspace_id,name,description,package_price,discount_type,discount_value,is_active,estimated_duration,created_by)
  select p_workspace_id,t.name,t.description,t.package_price,t.discount_type,t.discount_value,true,t.estimated_duration,auth.uid()
  from public.service_package_templates t
  where t.is_active
    and not exists(
      select 1 from public.service_packages p
      where p.workspace_id=p_workspace_id
        and lower(p.name)=lower(t.name)
    );
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

revoke all on function public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid)
  from public, anon;
revoke all on function public.populate_workspace_service_packages(uuid)
  from public, anon;

grant execute on function public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid)
  to authenticated, service_role;
grant execute on function public.populate_workspace_service_packages(uuid)
  to authenticated, service_role;

commit;
