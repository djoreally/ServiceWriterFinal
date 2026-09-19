-- Canonicalize catalog-backed public-booking prices on the server.
-- Dynamic non-catalog lines are accepted only from a narrow allowlist and are
-- cross-checked against server data / booking configuration where possible.

create or replace function public.public_booking_insert_services_v3(
 p_booking_slug text,p_appointment_id uuid,p_customer_email text,p_customer_phone text,p_services jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_catalog_price numeric;
 v_config jsonb;v_vehicle_config jsonb;v_size text;v_condition text;v_multiplier numeric;v_flat numeric;
 v_expected numeric;v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;
  v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);
  v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_catalog_price,v_name
   from public.service_catalog sc where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
   v_price:=v_catalog_price;
  else
   v_price:=coalesce((v_service->>'price')::numeric,-1);
   if v_price<0 then raise exception 'INVALID_DYNAMIC_SERVICE_AMOUNT'; end if;

   if v_name='Vehicle size & condition adjustment' then
    select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
    where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
    if v_vehicle_config is null then
      -- Older client configuration keys by client vehicle id, so validate from its pricing snapshot
      select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
      where elem ? 'detailing' limit 1;
    end if;
    v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
    select greatest(coalesce(d.price_multiplier,1),1),greatest(coalesce(d.flat_fee,0),0)
    into v_multiplier,v_flat from public.detailing_pricing_rules d
    where d.workspace_id=v_workspace_id and d.size_tier=v_size and d.condition=v_condition
      and (d.service_catalog_id is null or exists(select 1 from public.service_catalog sc where sc.id=d.service_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active))
    order by d.service_catalog_id nulls last limit 1;
    if not found then raise exception 'INVALID_DETAILING_ADJUSTMENT'; end if;
    select round(coalesce(sum(sc.labor_price),0)*(v_multiplier-1)+v_flat,2) into v_expected
    from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
    join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
    if abs(v_price-v_expected)>0.01 then raise exception 'INVALID_DETAILING_ADJUSTMENT'; end if;
    v_price:=v_expected;
   elsif v_name like 'Tire — %' then
    if v_vehicle_id is null or not exists(
      select 1 from public.inventory_items i
      where i.workspace_id=v_workspace_id and i.id=(
        select nullif(elem#>>'{tire,inventoryItemId}','')::uuid from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
        where elem#>>'{tire,inventoryItemId}' is not null limit 1
      )
    ) then raise exception 'INVALID_TIRE_ITEM'; end if;
    -- Inventory-selected tire pricing is validated later by reservation/inventory pricing; keep bounded client snapshot here.
    if v_price>10000 then raise exception 'INVALID_TIRE_AMOUNT'; end if;
   elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' then
    -- Extra-quart pricing is a dynamic oil-fitment line; tightly bound the quantity/amount until oil pricing is normalized server-side.
    if v_qty>10 or v_price>100 then raise exception 'INVALID_OIL_ADJUSTMENT'; end if;
   else
    raise exception 'UNSUPPORTED_DYNAMIC_SERVICE';
   end if;
  end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
    case when v_catalog_id is not null then 'service_catalog' else 'validated_dynamic' end)));
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

revoke all on function public.public_booking_insert_services_v3(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.public_booking_insert_services_v3(text,uuid,text,text,jsonb) to anon,authenticated,service_role;
