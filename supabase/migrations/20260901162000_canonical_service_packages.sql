create table if not exists public.service_package_templates (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text,
  package_price numeric(12,2) not null default 0 check (package_price >= 0),
  discount_type text not null default 'fixed' check (discount_type in ('fixed','percent','none')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  estimated_duration integer check (estimated_duration is null or estimated_duration > 0),
  is_active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now()
);

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, description text, package_price numeric(12,2) not null default 0 check (package_price >= 0),
  discount_type text not null default 'fixed' check (discount_type in ('fixed','percent','none')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0), is_active boolean not null default true,
  estimated_duration integer check (estimated_duration is null or estimated_duration > 0),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id, name)
);

create table if not exists public.service_package_items (
  id uuid primary key default gen_random_uuid(), package_id uuid not null references public.service_packages(id) on delete cascade,
  service_catalog_id uuid not null references public.service_catalog(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0), override_price numeric(12,2) check (override_price is null or override_price >= 0),
  created_at timestamptz not null default now(), unique(package_id, service_catalog_id)
);

create index if not exists service_packages_workspace_idx on public.service_packages(workspace_id);
create index if not exists service_package_items_package_idx on public.service_package_items(package_id);
create index if not exists service_package_items_catalog_idx on public.service_package_items(service_catalog_id);

alter table public.service_package_templates enable row level security;
alter table public.service_packages enable row level security;
alter table public.service_package_items enable row level security;

drop policy if exists service_package_templates_read on public.service_package_templates;
create policy service_package_templates_read on public.service_package_templates for select to authenticated using (is_active);
drop policy if exists service_packages_member_select on public.service_packages;
create policy service_packages_member_select on public.service_packages for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists service_packages_member_insert on public.service_packages;
create policy service_packages_member_insert on public.service_packages for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists service_packages_member_update on public.service_packages;
create policy service_packages_member_update on public.service_packages for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists service_packages_member_delete on public.service_packages;
create policy service_packages_member_delete on public.service_packages for delete to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists service_package_items_member_select on public.service_package_items;
create policy service_package_items_member_select on public.service_package_items for select to authenticated using (exists (select 1 from public.service_packages p where p.id=package_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists service_package_items_member_insert on public.service_package_items;
create policy service_package_items_member_insert on public.service_package_items for insert to authenticated with check (exists (select 1 from public.service_packages p where p.id=package_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists service_package_items_member_update on public.service_package_items;
create policy service_package_items_member_update on public.service_package_items for update to authenticated using (exists (select 1 from public.service_packages p where p.id=package_id and public.is_workspace_member(p.workspace_id))) with check (exists (select 1 from public.service_packages p where p.id=package_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists service_package_items_member_delete on public.service_package_items;
create policy service_package_items_member_delete on public.service_package_items for delete to authenticated using (exists (select 1 from public.service_packages p where p.id=package_id and public.is_workspace_member(p.workspace_id)));

grant select on public.service_package_templates to authenticated;
grant select, insert, update, delete on public.service_packages to authenticated;
grant select, insert, update, delete on public.service_package_items to authenticated;
grant all on public.service_package_templates, public.service_packages, public.service_package_items to service_role;

insert into public.service_package_templates (name,description,discount_type,discount_value,estimated_duration,sort_order) values
('Maintenance Bundle','Starter package for grouping routine maintenance services.','percent',0,60,10),
('Seasonal Service Bundle','Starter package for seasonal vehicle service combinations.','percent',0,60,20),
('Fleet PM Bundle','Starter package for preventive-maintenance service combinations.','percent',0,60,30)
on conflict (name) do nothing;

create or replace function public.upsert_service_package(
  p_workspace_id uuid,p_name text,p_description text,p_package_price numeric,p_discount_type text,p_discount_value numeric,
  p_is_active boolean,p_estimated_duration integer,p_items jsonb,p_package_id uuid default null
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_package_id uuid; v_item jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Not authorized for this workspace' using errcode='42501'; end if;
  if p_package_id is null then
    insert into public.service_packages(workspace_id,name,description,package_price,discount_type,discount_value,is_active,estimated_duration,created_by)
    values(p_workspace_id,trim(p_name),p_description,coalesce(p_package_price,0),coalesce(nullif(p_discount_type,''),'fixed'),coalesce(p_discount_value,0),coalesce(p_is_active,true),p_estimated_duration,auth.uid()) returning id into v_package_id;
  else
    update public.service_packages set name=trim(p_name),description=p_description,package_price=coalesce(p_package_price,0),discount_type=coalesce(nullif(p_discount_type,''),'fixed'),discount_value=coalesce(p_discount_value,0),is_active=coalesce(p_is_active,true),estimated_duration=p_estimated_duration,updated_at=now()
    where id=p_package_id and workspace_id=p_workspace_id returning id into v_package_id;
    if v_package_id is null then raise exception 'Package not found'; end if;
    delete from public.service_package_items where package_id=v_package_id;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if not exists(select 1 from public.service_catalog sc where sc.id=(v_item->>'service_catalog_id')::uuid and sc.workspace_id=p_workspace_id) then raise exception 'Service catalog item is not in this workspace'; end if;
    insert into public.service_package_items(package_id,service_catalog_id,quantity,override_price)
    values(v_package_id,(v_item->>'service_catalog_id')::uuid,greatest(1,coalesce((v_item->>'quantity')::integer,1)),nullif(v_item->>'override_price','')::numeric);
  end loop;
  return v_package_id;
end; $$;

grant execute on function public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid) to authenticated,service_role;

create or replace function public.populate_workspace_service_packages(p_workspace_id uuid) returns integer language plpgsql set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Not authorized for this workspace' using errcode='42501'; end if;
  insert into public.service_packages(workspace_id,name,description,package_price,discount_type,discount_value,is_active,estimated_duration,created_by)
  select p_workspace_id,t.name,t.description,t.package_price,t.discount_type,t.discount_value,true,t.estimated_duration,auth.uid()
  from public.service_package_templates t where t.is_active and not exists(select 1 from public.service_packages p where p.workspace_id=p_workspace_id and lower(p.name)=lower(t.name));
  get diagnostics v_count=row_count; return v_count;
end; $$;
grant execute on function public.populate_workspace_service_packages(uuid) to authenticated,service_role;

create or replace function public.get_public_service_packages(business_user_id uuid)
returns table(id uuid,name text,description text,package_price numeric,discount_type text,discount_value numeric,estimated_duration integer,services jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
select p.id,p.name,p.description,p.package_price,p.discount_type,p.discount_value,p.estimated_duration,
coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'description',sc.description,'default_price',sc.labor_price,'estimated_duration',sc.estimated_minutes,'quantity',pi.quantity,'override_price',pi.override_price) order by sc.name) filter(where pi.id is not null),'[]'::jsonb)
from public.service_packages p join public.workspaces w on w.id=p.workspace_id
left join public.service_package_items pi on pi.package_id=p.id left join public.service_catalog sc on sc.id=pi.service_catalog_id
where w.created_by=business_user_id and w.is_active and p.is_active group by p.id order by p.name; $$;
revoke all on function public.get_public_service_packages(uuid) from public;
grant execute on function public.get_public_service_packages(uuid) to anon,authenticated,service_role;
