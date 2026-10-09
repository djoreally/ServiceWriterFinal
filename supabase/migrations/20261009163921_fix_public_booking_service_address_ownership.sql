-- Public booking service locations belong to appointments, never customer profiles.
-- Keep the existing RPC signature for compatibility, but intentionally ignore p_address.

create or replace function public.public_booking_upsert_customer(
  p_booking_slug text,
  p_email text,
  p_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_phone_digits text;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;

  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if length(trim(coalesce(p_email,''))) < 3 or length(trim(coalesce(p_email,''))) > 320 or position('@' in p_email) < 2 then raise exception 'INVALID_EMAIL'; end if;
  if length(trim(coalesce(p_name,''))) < 1 or length(trim(p_name)) > 160 then raise exception 'INVALID_NAME'; end if;

  v_phone_digits := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if length(v_phone_digits) < 10 then raise exception 'INVALID_PHONE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || lower(trim(p_email)) || ':' || right(v_phone_digits,10),0));

  select c.id into v_customer_id
  from public.customers c
  where c.workspace_id = v_workspace_id
    and lower(c.email::text) = lower(trim(p_email))
    and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10) = right(v_phone_digits,10)
  order by c.created_at
  limit 1
  for update;

  if v_customer_id is not null then return v_customer_id; end if;

  v_first_name := split_part(trim(p_name),' ',1);
  v_last_name := nullif(trim(substr(trim(p_name),length(v_first_name)+1)),'');

  -- p_address is deliberately ignored. A booking address is a service location,
  -- not a durable customer/home/default address.
  insert into public.customers(workspace_id,first_name,last_name,email,phone,metadata)
  values(
    v_workspace_id,
    v_first_name,
    coalesce(v_last_name,''),
    lower(trim(p_email)),
    nullif(trim(p_phone),''),
    jsonb_build_object('source','public_booking','identity_match','email_phone')
  )
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

-- The normalized appointments table stores extension fields in metadata.
-- Do not write legacy columns that do not exist on the canonical table.
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
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;

  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  select a.customer_id,
         lower(coalesce(a.metadata->>'guest_email','')),
         coalesce(a.metadata->>'guest_phone','')
    into v_customer_id, v_email, v_phone
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

  update public.appointments
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'dispatch_notes', case when p_dispatch_notes is null then null else left(p_dispatch_notes,4000) end,
        'location_address', case when p_location_address is null then null else left(p_location_address,1000) end,
        'location_lat', p_location_lat,
        'location_lng', p_location_lng
      )),
      updated_at = now()
  where id = p_appointment_id
    and workspace_id = v_workspace_id;
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
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;

  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  select a.workspace_id into v_appointment_workspace
  from public.appointments a
  where a.id = p_appointment_id
    and a.source = 'public_booking'
    and a.created_at > now() - interval '30 minutes';

  if v_appointment_workspace is distinct from v_workspace_id then raise exception 'INVALID_APPOINTMENT'; end if;

  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  update public.appointments
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'dispatch_notes', case when p_dispatch_notes is null then null else left(p_dispatch_notes,4000) end,
        'location_address', case when p_location_address is null then null else left(p_location_address,1000) end,
        'location_lat', p_location_lat,
        'location_lng', p_location_lng
      )),
      updated_at = now()
  where id = p_appointment_id
    and workspace_id = v_workspace_id;
end;
$$;

revoke all on function public.public_booking_upsert_customer(text,text,text,text,text) from public;
grant execute on function public.public_booking_upsert_customer(text,text,text,text,text) to anon, authenticated;

revoke all on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) from public;
grant execute on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) to anon, authenticated;

revoke all on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) from public;
grant execute on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) to anon, authenticated;
