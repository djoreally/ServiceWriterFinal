-- Canonical public-booking commit boundary.
--
-- Browser code must never orchestrate customer -> vehicle -> appointment ->
-- configuration -> items -> payment as independent writes. This function owns
-- all durable booking facts in one PostgreSQL transaction.
--
-- Optional side effects (email, analytics, dispatch, provider checkout, inventory
-- telemetry) happen only after this transaction commits.

create or replace function public.public_booking_commit_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_slug text := trim(coalesce(p_payload->>'booking_slug',''));
  v_idempotency_key text := trim(coalesce(p_payload->>'idempotency_key',''));
  v_workspace_id uuid;
  v_business_user_id uuid;
  v_guest jsonb := coalesce(p_payload->'guest','{}'::jsonb);
  v_location jsonb := coalesce(p_payload->'location','{}'::jsonb);
  v_vehicles jsonb := coalesce(p_payload->'vehicles','[]'::jsonb);
  v_services jsonb := coalesce(p_payload->'services','[]'::jsonb);
  v_configuration jsonb := coalesce(p_payload->'configuration','{}'::jsonb);
  v_payment_choice text := coalesce(nullif(trim(p_payload->>'payment_choice'),''),'pay_later');
  v_currency text := upper(left(coalesce(nullif(trim(p_payload->>'currency'),''),'USD'),3));
  v_customer_id uuid;
  v_appointment_id uuid;
  v_payment_id uuid;
  v_existing_appointment_id uuid;
  v_existing_payment_id uuid;
  v_first_vehicle_id uuid;
  v_first_service_catalog_id uuid;
  v_vehicle jsonb;
  v_service jsonb;
  v_client_vehicle_id text;
  v_persisted_vehicle_id uuid;
  v_vehicle_map jsonb := '{}'::jsonb;
  v_mapped_services jsonb := '[]'::jsonb;
  v_enriched_configuration jsonb;
  v_config_vehicle jsonb;
  v_enriched_config_vehicles jsonb := '[]'::jsonb;
  v_inserted_item_count integer := 0;
  v_phone text := trim(coalesce(v_guest->>'phone',''));
  v_email text := lower(trim(coalesce(v_guest->>'email','')));
  v_name text := trim(coalesce(v_guest->>'name',''));
  v_address text := trim(coalesce(v_location->>'address',''));
  v_lat numeric;
  v_lng numeric;
  v_estimated_cost numeric := greatest(coalesce(nullif(p_payload->>'estimated_cost','')::numeric,0),0);
  v_tax_amount numeric := greatest(coalesce(nullif(p_payload->>'tax_amount','')::numeric,0),0);
  v_tax_rate numeric := greatest(coalesce(nullif(p_payload->>'tax_rate','')::numeric,0),0);
  v_client_amount_cents bigint;
  v_client_subtotal_cents bigint;
  v_client_tax_cents bigint;
begin
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'INVALID_BOOKING_PAYLOAD'; end if;
  if v_booking_slug = '' or length(v_booking_slug) > 160 then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if v_idempotency_key = '' or length(v_idempotency_key) > 128 then raise exception 'BOOKING_IDEMPOTENCY_REQUIRED'; end if;
  if v_name = '' or length(v_name) > 160 then raise exception 'INVALID_NAME'; end if;
  if length(v_email) < 3 or length(v_email) > 320 or position('@' in v_email) < 2 then raise exception 'INVALID_EMAIL'; end if;
  if length(regexp_replace(v_phone,'[^0-9]','','g')) < 10 then raise exception 'INVALID_PHONE'; end if;
  if v_address = '' or length(v_address) > 1000 then raise exception 'BOOKING_LOCATION_REQUIRED'; end if;
  if jsonb_typeof(v_vehicles) <> 'array' or jsonb_array_length(v_vehicles) < 1 or jsonb_array_length(v_vehicles) > 10 then raise exception 'INVALID_BOOKING_VEHICLES'; end if;
  if jsonb_typeof(v_services) <> 'array' or jsonb_array_length(v_services) < 1 or jsonb_array_length(v_services) > 25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
  if v_payment_choice not in ('pay_later','pay_now') then raise exception 'INVALID_PAYMENT_CHOICE'; end if;

  begin v_lat := nullif(v_location->>'lat','')::numeric; exception when others then raise exception 'INVALID_LATITUDE'; end;
  begin v_lng := nullif(v_location->>'lng','')::numeric; exception when others then raise exception 'INVALID_LONGITUDE'; end;
  if v_lat is not null and (v_lat < -90 or v_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if v_lng is not null and (v_lng < -180 or v_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id
  from public.resolve_public_booking_context(v_booking_slug)c;
  if v_workspace_id is null or v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':booking:'||v_idempotency_key,0));

  select a.id into v_existing_appointment_id
  from public.appointments a
  where a.workspace_id=v_workspace_id
    and a.source='public_booking'
    and a.metadata->>'booking_idempotency_key'=v_idempotency_key
  order by a.created_at limit 1;

  if v_existing_appointment_id is not null then
    select p.id into v_existing_payment_id
    from public.payments p
    where p.workspace_id=v_workspace_id
      and p.metadata->>'appointment_id'=v_existing_appointment_id::text
      and p.metadata->>'payment_type' in ('pay_at_service','pay_now')
    order by p.created_at limit 1;
    return jsonb_build_object(
      'workspace_id',v_workspace_id,
      'business_user_id',v_business_user_id,
      'appointment_id',v_existing_appointment_id,
      'payment_id',v_existing_payment_id,
      'payment_choice',v_payment_choice,
      'idempotent',true
    );
  end if;

  v_customer_id:=public.public_booking_upsert_customer(v_booking_slug,v_email,v_name,v_phone,null);
  if v_customer_id is null then raise exception 'CUSTOMER_PERSISTENCE_FAILED'; end if;

  for v_vehicle in select value from jsonb_array_elements(v_vehicles) loop
    v_client_vehicle_id:=trim(coalesce(v_vehicle->>'client_id',''));
    if v_client_vehicle_id='' then raise exception 'BOOKING_VEHICLE_CLIENT_ID_REQUIRED'; end if;
    if v_vehicle_map ? v_client_vehicle_id then raise exception 'DUPLICATE_BOOKING_VEHICLE'; end if;

    v_persisted_vehicle_id:=public.public_booking_upsert_vehicle(
      v_booking_slug,
      v_email,
      nullif(v_vehicle->>'year','')::integer,
      trim(coalesce(v_vehicle->>'make','')),
      trim(coalesce(v_vehicle->>'model','')),
      nullif(trim(coalesce(v_vehicle->>'license_plate','')),''),
      nullif(trim(coalesce(v_vehicle->>'vin','')),''),
      nullif(v_vehicle->>'mileage','')::integer,
      nullif(trim(coalesce(v_vehicle->>'oil_type','')),''),
      nullif(trim(coalesce(v_vehicle->>'oil_capacity','')),''),
      nullif(trim(coalesce(v_vehicle->>'image_url','')),''),
      nullif(trim(coalesce(v_vehicle->>'engine','')),''),
      v_phone
    );
    if v_persisted_vehicle_id is null then raise exception 'BOOKING_VEHICLE_PERSISTENCE_FAILED'; end if;
    if v_first_vehicle_id is null then v_first_vehicle_id:=v_persisted_vehicle_id; end if;
    v_vehicle_map:=v_vehicle_map||jsonb_build_object(v_client_vehicle_id,v_persisted_vehicle_id::text);
  end loop;

  for v_service in select value from jsonb_array_elements(v_services) loop
    v_client_vehicle_id:=trim(coalesce(v_service->>'client_vehicle_id',''));
    if v_client_vehicle_id='' or not(v_vehicle_map ? v_client_vehicle_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;
    v_persisted_vehicle_id:=(v_vehicle_map->>v_client_vehicle_id)::uuid;
    if nullif(v_service->>'service_catalog_id','') is not null and v_first_service_catalog_id is null then
      v_first_service_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;
    end if;
    v_mapped_services:=v_mapped_services||jsonb_build_array(
      (v_service-'client_vehicle_id')||jsonb_build_object('vehicle_id',v_persisted_vehicle_id)
    );
  end loop;

  if jsonb_typeof(v_configuration)<>'object' then raise exception 'INVALID_BOOKING_CONFIGURATION'; end if;
  if jsonb_typeof(coalesce(v_configuration->'vehicles','[]'::jsonb))<>'array' then raise exception 'INVALID_BOOKING_CONFIGURATION'; end if;
  for v_config_vehicle in select value from jsonb_array_elements(coalesce(v_configuration->'vehicles','[]'::jsonb)) loop
    v_client_vehicle_id:=trim(coalesce(v_config_vehicle->>'clientVehicleId',''));
    if v_client_vehicle_id='' or not(v_vehicle_map ? v_client_vehicle_id) then raise exception 'INVALID_CONFIGURATION_VEHICLE'; end if;
    v_enriched_config_vehicles:=v_enriched_config_vehicles||jsonb_build_array(
      v_config_vehicle||jsonb_build_object('persistedVehicleId',v_vehicle_map->>v_client_vehicle_id)
    );
  end loop;
  v_enriched_configuration:=(v_configuration-'vehicles')||jsonb_build_object('vehicles',v_enriched_config_vehicles);

  v_appointment_id:=public.public_booking_book_appointment_v3(
    v_booking_slug,
    nullif(p_payload->>'scheduled_date','')::date,
    nullif(p_payload->>'scheduled_time','')::time,
    nullif(p_payload->>'duration_minutes','')::integer,
    left(coalesce(p_payload->>'title','Online booking'),500),
    v_name,v_email,v_phone,
    coalesce(p_payload->>'description',''),
    nullif(trim(coalesce(p_payload->>'notes','')),''),
    v_estimated_cost,v_tax_amount,
    v_first_service_catalog_id,v_first_vehicle_id,
    v_address,v_lat,v_lng,'confirmed'
  );
  if v_appointment_id is null then raise exception 'APPOINTMENT_PERSISTENCE_FAILED'; end if;

  update public.appointments
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'booking_idempotency_key',v_idempotency_key,
        'booking_commit_version',1,
        'payment_choice',v_payment_choice
      ),updated_at=now()
  where id=v_appointment_id and workspace_id=v_workspace_id;

  perform public.public_booking_save_configuration_v2(v_booking_slug,v_appointment_id,v_email,v_phone,v_enriched_configuration);

  v_inserted_item_count:=public.public_booking_insert_services_v7(v_booking_slug,v_appointment_id,v_email,v_phone,v_mapped_services);
  if coalesce(v_inserted_item_count,0)<1 then raise exception 'BOOKING_ITEMS_REQUIRED'; end if;

  -- v3 computes the durable amount from canonical appointment items, not the
  -- browser's estimate. We use it for both payment choices so every booking has
  -- one pending payment ledger row before any external provider call.
  v_client_amount_cents:=round(v_estimated_cost*100)::bigint;
  v_client_tax_cents:=round(v_tax_amount*100)::bigint;
  v_client_subtotal_cents:=greatest(v_client_amount_cents-v_client_tax_cents,0);

  v_payment_id:=public.public_booking_record_payment_intent_v3(
    v_booking_slug,v_appointment_id,
    v_client_amount_cents,v_client_subtotal_cents,v_client_tax_cents,v_tax_rate,
    v_currency,v_email,v_phone,v_name
  );
  if v_payment_id is null then raise exception 'BOOKING_PAYMENT_INTENT_FAILED'; end if;

  if v_payment_choice='pay_now' then
    update public.payments
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'payment_type','pay_now',
          'requested_payment_method','online'
        ),updated_at=now()
    where id=v_payment_id and workspace_id=v_workspace_id;
  end if;

  update public.appointments
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('pricing_state','canonical'),updated_at=now()
  where id=v_appointment_id and workspace_id=v_workspace_id;

  return jsonb_build_object(
    'workspace_id',v_workspace_id,
    'business_user_id',v_business_user_id,
    'appointment_id',v_appointment_id,
    'payment_id',v_payment_id,
    'payment_choice',v_payment_choice,
    'customer_id',v_customer_id,
    'vehicle_ids',v_vehicle_map,
    'item_count',v_inserted_item_count,
    'idempotent',false
  );
end;
$$;

revoke all on function public.public_booking_commit_v1(jsonb) from public;
grant execute on function public.public_booking_commit_v1(jsonb) to anon,authenticated;
