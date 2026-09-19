-- Bind post-create public-booking mutations to the same guest identity captured on the appointment.
-- V1 endpoints remain temporarily for deployed-client compatibility.

create or replace function public.public_booking_insert_services_v2(
 p_booking_slug text,p_appointment_id uuid,p_customer_email text,p_customer_phone text,p_services jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;v_vehicle_id uuid;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_email,v_phone from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 for v_service in select value from jsonb_array_elements(p_services) loop
  v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  if v_vehicle_id is not null and not exists(
   select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id
  ) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;
 end loop;
 return public.insert_booking_appointment_services(p_appointment_id,p_services);
end $$;

create or replace function public.public_booking_save_configuration_v2(
 p_booking_slug text,p_appointment_id uuid,p_customer_email text,p_customer_phone text,p_configuration jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid;v_business_user_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;
begin
 select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_email,v_phone from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '15 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 perform public.save_appointment_booking_configuration(p_appointment_id,v_business_user_id,p_configuration);
end $$;

create or replace function public.public_booking_update_appointment_context_v2(
 p_booking_slug text,p_appointment_id uuid,p_customer_email text,p_customer_phone text,
 p_dispatch_notes text default null,p_location_address text default null,p_location_lat numeric default null,p_location_lng numeric default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_email,v_phone from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
 if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
 update public.appointments set
  dispatch_notes=case when p_dispatch_notes is null then dispatch_notes else left(p_dispatch_notes,4000) end,
  location_address=case when p_location_address is null then location_address else left(p_location_address,1000) end,
  location_lat=coalesce(p_location_lat,location_lat),location_lng=coalesce(p_location_lng,location_lng),updated_at=now()
 where id=p_appointment_id and workspace_id=v_workspace_id;
end $$;

revoke all on function public.public_booking_insert_services_v2(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.public_booking_insert_services_v2(text,uuid,text,text,jsonb) to anon,authenticated,service_role;
revoke all on function public.public_booking_save_configuration_v2(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.public_booking_save_configuration_v2(text,uuid,text,text,jsonb) to anon,authenticated,service_role;
revoke all on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) to anon,authenticated,service_role;
