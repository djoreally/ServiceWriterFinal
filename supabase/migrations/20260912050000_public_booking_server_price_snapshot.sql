create or replace function public.insert_booking_appointment_services(
  p_appointment_id uuid,
  p_services jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_count integer := 0;
  v_service jsonb;
  v_catalog_id uuid;
  v_catalog_name text;
  v_catalog_price numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_description text;
  v_pricing_source text;
begin
  select workspace_id into v_workspace_id
  from public.appointments
  where id = p_appointment_id
    and source = 'public_booking'
    and created_at > now() - interval '30 minutes';

  if v_workspace_id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) > 25 then
    raise exception 'INVALID_SERVICE_ITEMS';
  end if;

  if exists (
    select 1 from public.appointment_items
    where workspace_id=v_workspace_id and appointment_id=p_appointment_id
  ) then
    return 0;
  end if;

  for v_service in select value from jsonb_array_elements(p_services)
  loop
    v_catalog_id := nullif(v_service ->> 'service_catalog_id', '')::uuid;
    v_quantity := coalesce((v_service ->> 'quantity')::numeric,1);

    if v_quantity <= 0 or v_quantity > 100 then
      raise exception 'INVALID_SERVICE_QUANTITY';
    end if;

    if v_catalog_id is not null then
      select sc.name, sc.labor_price
        into v_catalog_name, v_catalog_price
      from public.service_catalog sc
      where sc.id=v_catalog_id
        and sc.workspace_id=v_workspace_id
        and sc.is_active
      limit 1;

      if v_catalog_name is null then raise exception 'INVALID_SERVICE'; end if;

      v_unit_price := round(greatest(coalesce(v_catalog_price,0),0),2);
      v_description := left(v_catalog_name,250);
      v_pricing_source := 'service_catalog_snapshot';
    else
      v_unit_price := round(coalesce((v_service ->> 'price')::numeric,0),2);
      if v_unit_price < 0 or v_unit_price > 100000 then
        raise exception 'INVALID_SERVICE_AMOUNT';
      end if;
      v_description := left(coalesce(nullif(trim(v_service->>'name'),''),'Custom adjustment'),250);
      v_pricing_source := 'custom_booking_adjustment';
    end if;

    insert into public.appointment_items(
      workspace_id,appointment_id,service_catalog_id,description,
      quantity,unit_price,is_prepaid,sort_order,metadata
    )
    values (
      v_workspace_id,p_appointment_id,v_catalog_id,v_description,
      v_quantity,v_unit_price,
      coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
      jsonb_strip_nulls(jsonb_build_object(
        'vehicle_id',v_service->>'vehicle_id',
        'source','public_booking',
        'pricing_source',v_pricing_source,
        'catalog_price_snapshot',case when v_catalog_id is not null then v_unit_price else null end
      ))
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.insert_booking_appointment_services(uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.insert_booking_appointment_services(uuid,jsonb)
to service_role;

-- The slug-scoped wrapper remains the only browser-callable write contract.
grant execute on function public.public_booking_insert_services(text,uuid,jsonb)
to anon,authenticated;
