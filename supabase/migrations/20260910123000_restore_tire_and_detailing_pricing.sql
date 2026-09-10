create table if not exists public.tire_service_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid not null references public.service_catalog(id) on delete cascade,
  base_installation_price numeric(12,2) not null default 0 check (base_installation_price >= 0),
  mount_balance_price numeric(12,2) not null default 0 check (mount_balance_price >= 0),
  tpms_service_price numeric(12,2) not null default 0 check (tpms_service_price >= 0),
  disposal_price numeric(12,2) not null default 0 check (disposal_price >= 0),
  alignment_price numeric(12,2) not null default 0 check (alignment_price >= 0),
  minimum_quantity integer not null default 1 check (minimum_quantity between 1 and 20),
  maximum_quantity integer not null default 4 check (maximum_quantity between 1 and 20 and maximum_quantity >= minimum_quantity),
  requires_inventory_selection boolean not null default false,
  requires_fitment_lookup boolean not null default true,
  allows_manual_fitment boolean not null default true,
  allows_staggered_fitment boolean not null default false,
  duration_minutes_per_tire integer not null default 30 check (duration_minutes_per_tire between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, service_catalog_id)
);

create table if not exists public.detailing_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid references public.service_catalog(id) on delete cascade,
  size_tier text not null check (size_tier in ('compact','midsize','large','oversize')),
  condition text not null check (condition in ('light','moderate','heavy')),
  price_multiplier numeric(8,4) not null default 1 check (price_multiplier > 0),
  duration_multiplier numeric(8,4) not null default 1 check (duration_multiplier > 0),
  flat_fee numeric(12,2) not null default 0 check (flat_fee >= 0),
  photo_required boolean not null default false,
  quote_required boolean not null default false,
  requires_water boolean not null default false,
  requires_power boolean not null default false,
  requires_covered_area boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists detailing_pricing_rules_unique_scope
  on public.detailing_pricing_rules(workspace_id, coalesce(service_catalog_id, '00000000-0000-0000-0000-000000000000'::uuid), size_tier, condition);
create index if not exists tire_service_pricing_rules_workspace_idx on public.tire_service_pricing_rules(workspace_id);
create index if not exists detailing_pricing_rules_workspace_idx on public.detailing_pricing_rules(workspace_id);

alter table public.tire_service_pricing_rules enable row level security;
alter table public.detailing_pricing_rules enable row level security;
revoke all on public.tire_service_pricing_rules from public, anon;
revoke all on public.detailing_pricing_rules from public, anon;
grant select,insert,update,delete on public.tire_service_pricing_rules to authenticated;
grant select,insert,update,delete on public.detailing_pricing_rules to authenticated;
grant all on public.tire_service_pricing_rules, public.detailing_pricing_rules to service_role;

drop policy if exists tire_pricing_member_select on public.tire_service_pricing_rules;
create policy tire_pricing_member_select on public.tire_service_pricing_rules for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists tire_pricing_writer_insert on public.tire_service_pricing_rules;
create policy tire_pricing_writer_insert on public.tire_service_pricing_rules for insert to authenticated with check (public.is_workspace_writer(workspace_id));
drop policy if exists tire_pricing_writer_update on public.tire_service_pricing_rules;
create policy tire_pricing_writer_update on public.tire_service_pricing_rules for update to authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
drop policy if exists tire_pricing_writer_delete on public.tire_service_pricing_rules;
create policy tire_pricing_writer_delete on public.tire_service_pricing_rules for delete to authenticated using (public.is_workspace_writer(workspace_id));

drop policy if exists detailing_pricing_member_select on public.detailing_pricing_rules;
create policy detailing_pricing_member_select on public.detailing_pricing_rules for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists detailing_pricing_writer_insert on public.detailing_pricing_rules;
create policy detailing_pricing_writer_insert on public.detailing_pricing_rules for insert to authenticated with check (public.is_workspace_writer(workspace_id));
drop policy if exists detailing_pricing_writer_update on public.detailing_pricing_rules;
create policy detailing_pricing_writer_update on public.detailing_pricing_rules for update to authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
drop policy if exists detailing_pricing_writer_delete on public.detailing_pricing_rules;
create policy detailing_pricing_writer_delete on public.detailing_pricing_rules for delete to authenticated using (public.is_workspace_writer(workspace_id));

create or replace function public.replace_detailing_pricing_rules_for_service(p_service_catalog_id uuid, p_rules jsonb)
returns integer language plpgsql security invoker set search_path to '' as $$
declare v_workspace_id uuid; v_rule jsonb; v_count integer := 0;
begin
  if p_service_catalog_id is null then raise exception 'service catalog id is required' using errcode='22023'; end if;
  select sc.workspace_id into v_workspace_id from public.service_catalog sc where sc.id=p_service_catalog_id;
  if v_workspace_id is null or not public.is_workspace_writer(v_workspace_id) then raise exception 'Not authorized for this service' using errcode='42501'; end if;
  delete from public.detailing_pricing_rules where workspace_id=v_workspace_id and service_catalog_id=p_service_catalog_id;
  for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) loop
    insert into public.detailing_pricing_rules(workspace_id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area)
    values(v_workspace_id,p_service_catalog_id,v_rule->>'size_tier',v_rule->>'condition',coalesce((v_rule->>'price_multiplier')::numeric,1),coalesce((v_rule->>'duration_multiplier')::numeric,1),coalesce((v_rule->>'flat_fee')::numeric,0),coalesce((v_rule->>'photo_required')::boolean,false),coalesce((v_rule->>'quote_required')::boolean,false),coalesce((v_rule->>'requires_water')::boolean,false),coalesce((v_rule->>'requires_power')::boolean,false),coalesce((v_rule->>'requires_covered_area')::boolean,false));
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.replace_detailing_pricing_rules_for_service(uuid,jsonb) from public,anon;
grant execute on function public.replace_detailing_pricing_rules_for_service(uuid,jsonb) to authenticated,service_role;

create or replace function public.replace_detailing_pricing_rules(p_workspace_id uuid, p_rules jsonb)
returns integer language plpgsql security invoker set search_path to '' as $$
declare v_rule jsonb; v_service_id uuid; v_count integer := 0;
begin
  if not public.is_workspace_writer(p_workspace_id) then raise exception 'Not authorized for this workspace' using errcode='42501'; end if;
  delete from public.detailing_pricing_rules where workspace_id=p_workspace_id;
  for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) loop
    v_service_id := nullif(v_rule->>'service_catalog_id','')::uuid;
    if v_service_id is not null and not exists(select 1 from public.service_catalog sc where sc.id=v_service_id and sc.workspace_id=p_workspace_id) then raise exception 'Service does not belong to workspace' using errcode='42501'; end if;
    insert into public.detailing_pricing_rules(workspace_id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area)
    values(p_workspace_id,v_service_id,v_rule->>'size_tier',v_rule->>'condition',coalesce((v_rule->>'price_multiplier')::numeric,1),coalesce((v_rule->>'duration_multiplier')::numeric,1),coalesce((v_rule->>'flat_fee')::numeric,0),coalesce((v_rule->>'photo_required')::boolean,false),coalesce((v_rule->>'quote_required')::boolean,false),coalesce((v_rule->>'requires_water')::boolean,false),coalesce((v_rule->>'requires_power')::boolean,false),coalesce((v_rule->>'requires_covered_area')::boolean,false));
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.replace_detailing_pricing_rules(uuid,jsonb) from public,anon;
grant execute on function public.replace_detailing_pricing_rules(uuid,jsonb) to authenticated,service_role;

create or replace function public.get_public_detailing_pricing_rules(p_business_user_id uuid)
returns setof public.detailing_pricing_rules language sql stable security definer set search_path to '' as $$
  select d.* from public.detailing_pricing_rules d join public.workspaces w on w.id=d.workspace_id where w.created_by=p_business_user_id and w.is_active;
$$;
revoke all on function public.get_public_detailing_pricing_rules(uuid) from public;
grant execute on function public.get_public_detailing_pricing_rules(uuid) to anon,authenticated,service_role;
