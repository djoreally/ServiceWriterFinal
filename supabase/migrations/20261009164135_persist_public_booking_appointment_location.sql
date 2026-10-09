-- Persist each public booking's service address on the appointment itself.
-- The location row is appointment-scoped and is never treated as a customer default/home address.

create or replace function public.public_booking_update_appointment_context_v2(
  p_booking_slug text,
  p_appointment_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_dispatch_notes text default null,
  p_location_address text default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_location_id uuid;
  v_existing_location_type public.location_type;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  select a.customer_id,
         lower(coalesce(a.metadata->>'guest_email','')),
         coalesce(a.metadata->>'guest_phone',''),
         a.location_id
    into v_customer_id, v_email, v_phone, v_location_id
  from public.appointments a
  where a.id = p_appointment_id
    and a.workspace_id = v_workspace_id
    and a.source = 'public_booking'
    and a.created_at > now() - interval '30 minutes';

  if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;

  v_phone_digits := regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
  if v_email <> lower(trim(coalesce(p_customer_email,'')))
     or length(v_phone_digits) < 10
     or right(regexp_replace(v_phone,'[^0-9]','','g'),10) <> right(v_phone_digits,10)
  then
    raise exception 'CUSTOMER_CONTEXT_INVALID';
  end if;

  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  if v_location_id is not null then
    select l.location_type into v_existing_location_type
    from public.locations l
    where l.id = v_location_id and l.workspace_id = v_workspace_id;
  end if;

  if p_location_address is not null then
    if v_location_id is not null and v_existing_location_type = 'customer_site'::public.location_type then
      update public.locations
      set address_line1 = left(trim(p_location_address),1000),
          latitude = coalesce(p_location_lat, latitude),
          longitude = coalesce(p_location_lng, longitude),
          updated_at = now()
      where id = v_location_id and workspace_id = v_workspace_id;
    else
      insert into public.locations(
        workspace_id,
        name,
        location_type,
        address_line1,
        latitude,
        longitude
      ) values (
        v_workspace_id,
        'Appointment service location',
        'customer_site'::public.location_type,
        left(trim(p_location_address),1000),
        p_location_lat,
        p_location_lng
      ) returning id into v_location_id;
    end if;
  elsif v_location_id is not null and v_existing_location_type = 'customer_site'::public.location_type then
    update public.locations
    set latitude = coalesce(p_location_lat, latitude),
        longitude = coalesce(p_location_lng, longitude),
        updated_at = now()
    where id = v_location_id and workspace_id = v_workspace_id;
  end if;

  update public.appointments
  set location_id = coalesce(v_location_id, location_id),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'dispatch_notes', case when p_dispatch_notes is null then null else left(p_dispatch_notes,4000) end,
        'location_address', case when p_location_address is null then null else left(trim(p_location_address),1000) end,
        'location_lat', p_location_lat,
        'location_lng', p_location_lng
      )),
      updated_at = now()
  where id = p_appointment_id and workspace_id = v_workspace_id;
end;
$$;

create or replace function public.public_booking_update_appointment_context(
  p_booking_slug text,
  p_appointment_id uuid,
  p_dispatch_notes text default null,
  p_location_address text default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_appointment_workspace uuid;
  v_location_id uuid;
  v_existing_location_type public.location_type;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  select a.workspace_id, a.location_id into v_appointment_workspace, v_location_id
  from public.appointments a
  where a.id = p_appointment_id
    and a.source = 'public_booking'
    and a.created_at > now() - interval '30 minutes';

  if v_appointment_workspace is distinct from v_workspace_id then raise exception 'INVALID_APPOINTMENT'; end if;

  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  if v_location_id is not null then
    select l.location_type into v_existing_location_type
    from public.locations l
    where l.id = v_location_id and l.workspace_id = v_workspace_id;
  end if;

  if p_location_address is not null then
    if v_location_id is not null and v_existing_location_type = 'customer_site'::public.location_type then
      update public.locations
      set address_line1 = left(trim(p_location_address),1000),
          latitude = coalesce(p_location_lat, latitude),
          longitude = coalesce(p_location_lng, longitude),
          updated_at = now()
      where id = v_location_id and workspace_id = v_workspace_id;
    else
      insert into public.locations(workspace_id,name,location_type,address_line1,latitude,longitude)
      values(v_workspace_id,'Appointment service location','customer_site'::public.location_type,left(trim(p_location_address),1000),p_location_lat,p_location_lng)
      returning id into v_location_id;
    end if;
  elsif v_location_id is not null and v_existing_location_type = 'customer_site'::public.location_type then
    update public.locations
    set latitude = coalesce(p_location_lat, latitude),
        longitude = coalesce(p_location_lng, longitude),
        updated_at = now()
    where id = v_location_id and workspace_id = v_workspace_id;
  end if;

  update public.appointments
  set location_id = coalesce(v_location_id, location_id),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'dispatch_notes', case when p_dispatch_notes is null then null else left(p_dispatch_notes,4000) end,
        'location_address', case when p_location_address is null then null else left(trim(p_location_address),1000) end,
        'location_lat', p_location_lat,
        'location_lng', p_location_lng
      )),
      updated_at = now()
  where id = p_appointment_id and workspace_id = v_workspace_id;
end;
$$;

revoke all on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) from public;
grant execute on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) to anon, authenticated;

revoke all on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) from public;
grant execute on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) to anon, authenticated;
