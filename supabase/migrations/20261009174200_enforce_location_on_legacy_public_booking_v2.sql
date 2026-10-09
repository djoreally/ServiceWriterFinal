-- Keep the currently deployed public-booking client safe during rollout.
-- The browser already sends its entered service address to the customer-upsert
-- call before appointment creation. Stage that address in a short-lived booking
-- intent (never on the customer), then require and consume it atomically when the
-- legacy v2 booking RPC creates the appointment.

create table if not exists public.public_booking_location_intents (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  phone_last10 text not null,
  address text not null,
  latitude numeric,
  longitude numeric,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,email,phone_last10)
);

alter table public.public_booking_location_intents enable row level security;
revoke all on public.public_booking_location_intents from public, anon, authenticated;

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
  v_email text;
begin
  select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if length(trim(coalesce(p_email,'')))<3 or length(trim(coalesce(p_email,'')))>320 or position('@' in p_email)<2 then raise exception 'INVALID_EMAIL'; end if;
  if length(trim(coalesce(p_name,'')))<1 or length(trim(p_name))>160 then raise exception 'INVALID_NAME'; end if;
  v_phone_digits:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if length(v_phone_digits)<10 then raise exception 'INVALID_PHONE'; end if;
  v_email:=lower(trim(p_email));

  if nullif(trim(coalesce(p_address,'')),'') is not null then
    if length(trim(p_address)) > 1000 then raise exception 'BOOKING_LOCATION_TOO_LONG'; end if;
    insert into public.public_booking_location_intents(workspace_id,email,phone_last10,address,updated_at)
    values(v_workspace_id,v_email,right(v_phone_digits,10),trim(p_address),now())
    on conflict(workspace_id,email,phone_last10) do update
      set address=excluded.address, latitude=null, longitude=null, updated_at=now();
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':'||v_email||':'||right(v_phone_digits,10),0));
  select c.id into v_customer_id from public.customers c
  where c.workspace_id=v_workspace_id and lower(c.email::text)=v_email
    and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10)
  order by c.created_at limit 1 for update;
  if v_customer_id is not null then return v_customer_id; end if;

  v_first_name:=split_part(trim(p_name),' ',1);
  v_last_name:=nullif(trim(substr(trim(p_name),length(v_first_name)+1)),'');
  insert into public.customers(workspace_id,first_name,last_name,email,phone,metadata)
  values(v_workspace_id,v_first_name,coalesce(v_last_name,''),v_email,nullif(trim(p_phone),''),jsonb_build_object('source','public_booking','identity_match','email_phone'))
  returning id into v_customer_id;
  return v_customer_id;
end;
$$;

create or replace function public.public_booking_book_appointment_v2(
  p_booking_slug text,
  p_scheduled_date date,
  p_scheduled_time time without time zone,
  p_duration_minutes integer,
  p_title text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_description text,
  p_notes text,
  p_estimated_cost numeric,
  p_tax_amount numeric,
  p_service_catalog_id uuid,
  p_vehicle_id uuid,
  p_status text default 'confirmed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_phone_digits text;
  v_address text;
  v_lat numeric;
  v_lng numeric;
  v_appointment_id uuid;
begin
  select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  v_phone_digits:=regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
  if length(v_phone_digits)<10 then raise exception 'INVALID_PHONE'; end if;

  select i.address,i.latitude,i.longitude into v_address,v_lat,v_lng
  from public.public_booking_location_intents i
  where i.workspace_id=v_workspace_id
    and i.email=lower(trim(p_guest_email))
    and i.phone_last10=right(v_phone_digits,10)
    and i.updated_at > now()-interval '2 hours'
  for update;

  if nullif(trim(coalesce(v_address,'')),'') is null then raise exception 'BOOKING_LOCATION_REQUIRED'; end if;

  v_appointment_id:=public.public_booking_book_appointment_v3(
    p_booking_slug,p_scheduled_date,p_scheduled_time,p_duration_minutes,p_title,
    p_guest_name,p_guest_email,p_guest_phone,p_description,p_notes,p_estimated_cost,
    p_tax_amount,p_service_catalog_id,p_vehicle_id,v_address,v_lat,v_lng,p_status
  );

  delete from public.public_booking_location_intents
  where workspace_id=v_workspace_id and email=lower(trim(p_guest_email)) and phone_last10=right(v_phone_digits,10);

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_upsert_customer(text,text,text,text,text) from public;
grant execute on function public.public_booking_upsert_customer(text,text,text,text,text) to anon, authenticated;
revoke all on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public;
grant execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon, authenticated;
