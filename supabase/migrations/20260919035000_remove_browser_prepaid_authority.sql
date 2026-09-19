-- V7: payment selection cannot mark service lines prepaid; only settled payment state may do that.\n-- Make extra-oil quantity server-derived from the persisted vehicle service spec.
create or replace function public.public_booking_insert_services_v7(
 p_booking_slug text,p_appointment_id uuid,p_customer_email text,p_customer_phone text,p_services jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_config jsonb;v_vehicle_config jsonb;
 v_inventory_id uuid;v_oil_price numeric;v_capacity_text text;v_capacity numeric;v_extra_quarts numeric;
 v_size text;v_condition text;v_multiplier numeric;v_flat numeric;v_base numeric;v_count integer:=0;
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
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_price,v_name from public.service_catalog sc
   where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
  elsif v_name='Vehicle size & condition adjustment' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   if v_vehicle_config is null then raise exception 'INVALID_DETAILING_CONTEXT'; end if;
   v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
   select d.price_multiplier,d.flat_fee into v_multiplier,v_flat from public.detailing_pricing_rules d
   where d.workspace_id=v_workspace_id and d.service_catalog_id is null and d.size_tier=v_size and d.condition=v_condition limit 1;
   if not found then raise exception 'DETAILING_PRICE_NOT_CONFIGURED'; end if;
   select coalesce(sum(sc.labor_price),0) into v_base from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
   join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
   v_price:=round(greatest(0,v_base*(v_multiplier-1)+v_flat),2);v_qty:=1;
  elsif v_name like 'Tire — %' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem#>>'{tire,inventoryItemId}','') is not null and nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   v_inventory_id:=nullif(v_vehicle_config#>>'{tire,inventoryItemId}','')::uuid;
   select i.sell_price into v_price from public.inventory_items i where i.id=v_inventory_id and i.workspace_id=v_workspace_id and i.is_active
    and (i.part_type='tire' or i.category ilike '%tire%' or i.tire_size is not null) and i.sell_price is not null and i.sell_price>=0;
   if not found then raise exception 'INVALID_TIRE_ITEM'; end if;
   if v_qty<>coalesce((v_vehicle_config#>>'{tire,frontQuantity}')::numeric,0)+coalesce((v_vehicle_config#>>'{tire,rearQuantity}')::numeric,0) then raise exception 'INVALID_TIRE_QUANTITY'; end if;
  elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' or lower(v_name)='additional oil quarts' then
   if v_vehicle_id is null then raise exception 'OIL_VEHICLE_REQUIRED'; end if;
   select s.oil_capacity into v_capacity_text from public.vehicle_service_specs s
    where s.workspace_id=v_workspace_id and s.vehicle_id=v_vehicle_id;
   if nullif(trim(coalesce(v_capacity_text,'')),'') is null then raise exception 'OIL_CAPACITY_REQUIRED'; end if;
   -- Mirror client parser: first numeric value, gallons converted to quarts; otherwise capacity is quarts.
   begin v_capacity:=substring(v_capacity_text from '([0-9]+(?:\.[0-9]+)?)')::numeric; exception when others then v_capacity:=null; end;
   if v_capacity is null or v_capacity<=0 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   if lower(v_capacity_text) like '%gal%' then v_capacity:=v_capacity*4; end if;
   v_capacity:=round(v_capacity,1);
   v_extra_quarts:=greatest(0,ceil(v_capacity-5));
   if v_extra_quarts<=0 then raise exception 'EXTRA_OIL_NOT_REQUIRED'; end if;
   if v_extra_quarts>10 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   select greatest(coalesce(ws.oil_price_per_quart,0),0) into v_oil_price from public.workspace_settings ws where ws.workspace_id=v_workspace_id;
   if v_oil_price is null then raise exception 'OIL_PRICE_NOT_CONFIGURED'; end if;
   v_qty:=v_extra_quarts;v_price:=v_oil_price;
  else raise exception 'UNSUPPORTED_DYNAMIC_SERVICE'; end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,false,v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
   case when v_catalog_id is not null then 'service_catalog' when v_name='Vehicle size & condition adjustment' then 'detailing_pricing_rules'
   when v_name like 'Tire — %' then 'inventory_sell_price' else 'workspace_oil_price' end,
   'quantity_source',case when lower(v_name) like '%oil%' and v_catalog_id is null then 'vehicle_service_specs_capacity' else null end)));
  v_count:=v_count+1;
 end loop;return v_count;
end $$;
revoke all on function public.public_booking_insert_services_v7(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.public_booking_insert_services_v7(text,uuid,text,text,jsonb) to anon,authenticated,service_role;
