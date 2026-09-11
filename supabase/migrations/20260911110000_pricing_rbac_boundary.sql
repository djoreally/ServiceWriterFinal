-- Shot 10: restrict customer-facing pricing mutation to management roles.
-- Prepared detached from main; apply only with the final certified release.

begin;

drop policy if exists tire_pricing_writer_insert on public.tire_service_pricing_rules;
create policy tire_pricing_manager_insert
on public.tire_service_pricing_rules
for insert to authenticated
with check (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists tire_pricing_writer_update on public.tire_service_pricing_rules;
create policy tire_pricing_manager_update
on public.tire_service_pricing_rules
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

drop policy if exists tire_pricing_writer_delete on public.tire_service_pricing_rules;
create policy tire_pricing_manager_delete
on public.tire_service_pricing_rules
for delete to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists detailing_pricing_writer_insert on public.detailing_pricing_rules;
create policy detailing_pricing_manager_insert
on public.detailing_pricing_rules
for insert to authenticated
with check (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

drop policy if exists detailing_pricing_writer_update on public.detailing_pricing_rules;
create policy detailing_pricing_manager_update
on public.detailing_pricing_rules
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

drop policy if exists detailing_pricing_writer_delete on public.detailing_pricing_rules;
create policy detailing_pricing_manager_delete
on public.detailing_pricing_rules
for delete to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  )
);

create or replace function public.replace_detailing_pricing_rules_for_service(
  p_service_catalog_id uuid,
  p_rules jsonb
)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_workspace_id uuid;
  v_rule jsonb;
  v_count integer := 0;
begin
  if p_service_catalog_id is null then
    raise exception 'service catalog id is required' using errcode='22023';
  end if;

  select sc.workspace_id
    into v_workspace_id
  from public.service_catalog sc
  where sc.id = p_service_catalog_id;

  if v_workspace_id is null
     or not public.has_workspace_role(
       v_workspace_id,
       array['owner','admin','manager','service_advisor']::public.member_role[]
     ) then
    raise exception 'Pricing management permission required' using errcode='42501';
  end if;

  delete from public.detailing_pricing_rules
  where workspace_id=v_workspace_id
    and service_catalog_id=p_service_catalog_id;

  for v_rule in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb))
  loop
    insert into public.detailing_pricing_rules(
      workspace_id,service_catalog_id,size_tier,condition,
      price_multiplier,duration_multiplier,flat_fee,photo_required,
      quote_required,requires_water,requires_power,requires_covered_area
    )
    values(
      v_workspace_id,p_service_catalog_id,
      v_rule->>'size_tier',
      v_rule->>'condition',
      coalesce((v_rule->>'price_multiplier')::numeric,1),
      coalesce((v_rule->>'duration_multiplier')::numeric,1),
      coalesce((v_rule->>'flat_fee')::numeric,0),
      coalesce((v_rule->>'photo_required')::boolean,false),
      coalesce((v_rule->>'quote_required')::boolean,false),
      coalesce((v_rule->>'requires_water')::boolean,false),
      coalesce((v_rule->>'requires_power')::boolean,false),
      coalesce((v_rule->>'requires_covered_area')::boolean,false)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.replace_detailing_pricing_rules(
  p_workspace_id uuid,
  p_rules jsonb
)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_rule jsonb;
  v_service_id uuid;
  v_count integer := 0;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  ) then
    raise exception 'Pricing management permission required' using errcode='42501';
  end if;

  delete from public.detailing_pricing_rules
  where workspace_id=p_workspace_id;

  for v_rule in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb))
  loop
    v_service_id := nullif(v_rule->>'service_catalog_id','')::uuid;
    if v_service_id is not null
       and not exists (
         select 1
         from public.service_catalog sc
         where sc.id=v_service_id
           and sc.workspace_id=p_workspace_id
       ) then
      raise exception 'Service does not belong to workspace' using errcode='42501';
    end if;

    insert into public.detailing_pricing_rules(
      workspace_id,service_catalog_id,size_tier,condition,
      price_multiplier,duration_multiplier,flat_fee,photo_required,
      quote_required,requires_water,requires_power,requires_covered_area
    )
    values(
      p_workspace_id,v_service_id,
      v_rule->>'size_tier',
      v_rule->>'condition',
      coalesce((v_rule->>'price_multiplier')::numeric,1),
      coalesce((v_rule->>'duration_multiplier')::numeric,1),
      coalesce((v_rule->>'flat_fee')::numeric,0),
      coalesce((v_rule->>'photo_required')::boolean,false),
      coalesce((v_rule->>'quote_required')::boolean,false),
      coalesce((v_rule->>'requires_water')::boolean,false),
      coalesce((v_rule->>'requires_power')::boolean,false),
      coalesce((v_rule->>'requires_covered_area')::boolean,false)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.replace_detailing_pricing_rules_for_scope(
  p_workspace_id uuid,
  p_service_catalog_id uuid,
  p_rules jsonb
)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_rule jsonb;
  v_count integer := 0;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner','admin','manager','service_advisor']::public.member_role[]
  ) then
    raise exception 'Pricing management permission required' using errcode='42501';
  end if;

  if p_service_catalog_id is not null
     and not exists (
       select 1
       from public.service_catalog sc
       where sc.id=p_service_catalog_id
         and sc.workspace_id=p_workspace_id
     ) then
    raise exception 'Service does not belong to workspace' using errcode='42501';
  end if;

  delete from public.detailing_pricing_rules
  where workspace_id=p_workspace_id
    and service_catalog_id is not distinct from p_service_catalog_id;

  for v_rule in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb))
  loop
    insert into public.detailing_pricing_rules(
      workspace_id,service_catalog_id,size_tier,condition,
      price_multiplier,duration_multiplier,flat_fee,photo_required,
      quote_required,requires_water,requires_power,requires_covered_area
    )
    values(
      p_workspace_id,p_service_catalog_id,
      v_rule->>'size_tier',
      v_rule->>'condition',
      coalesce((v_rule->>'price_multiplier')::numeric,1),
      coalesce((v_rule->>'duration_multiplier')::numeric,1),
      coalesce((v_rule->>'flat_fee')::numeric,0),
      coalesce((v_rule->>'photo_required')::boolean,false),
      coalesce((v_rule->>'quote_required')::boolean,false),
      coalesce((v_rule->>'requires_water')::boolean,false),
      coalesce((v_rule->>'requires_power')::boolean,false),
      coalesce((v_rule->>'requires_covered_area')::boolean,false)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

commit;
