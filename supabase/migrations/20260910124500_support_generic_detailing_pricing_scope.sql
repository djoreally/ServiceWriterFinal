create or replace function public.replace_detailing_pricing_rules_for_scope(p_workspace_id uuid, p_service_catalog_id uuid, p_rules jsonb)
returns integer
language plpgsql
security invoker
set search_path to ''
as $$
declare v_rule jsonb; v_count integer := 0;
begin
  if not public.is_workspace_writer(p_workspace_id) then raise exception 'Not authorized for this workspace' using errcode='42501'; end if;
  if p_service_catalog_id is not null and not exists(select 1 from public.service_catalog sc where sc.id=p_service_catalog_id and sc.workspace_id=p_workspace_id) then
    raise exception 'Service does not belong to workspace' using errcode='42501';
  end if;
  delete from public.detailing_pricing_rules
   where workspace_id=p_workspace_id
     and service_catalog_id is not distinct from p_service_catalog_id;
  for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) loop
    insert into public.detailing_pricing_rules(workspace_id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area)
    values(p_workspace_id,p_service_catalog_id,v_rule->>'size_tier',v_rule->>'condition',coalesce((v_rule->>'price_multiplier')::numeric,1),coalesce((v_rule->>'duration_multiplier')::numeric,1),coalesce((v_rule->>'flat_fee')::numeric,0),coalesce((v_rule->>'photo_required')::boolean,false),coalesce((v_rule->>'quote_required')::boolean,false),coalesce((v_rule->>'requires_water')::boolean,false),coalesce((v_rule->>'requires_power')::boolean,false),coalesce((v_rule->>'requires_covered_area')::boolean,false));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.replace_detailing_pricing_rules_for_scope(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_detailing_pricing_rules_for_scope(uuid,uuid,jsonb) to authenticated,service_role;
