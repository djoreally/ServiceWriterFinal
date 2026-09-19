-- Harden guest booking customer/vehicle identity while preserving booking.
-- Existing records are only re-used when BOTH normalized email and phone match.
-- If they do not match, a new booking customer is created rather than exposing
-- or mutating an existing customer's vehicles.

create or replace function public.public_booking_upsert_customer(
 p_booking_slug text,p_email text,p_name text,p_phone text default null,p_address text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid; v_customer_id uuid; v_first_name text; v_last_name text; v_phone_digits text;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 if length(trim(coalesce(p_email,'')))<3 or length(trim(coalesce(p_email,'')))>320 or position('@' in p_email)<2 then raise exception 'INVALID_EMAIL'; end if;
 if length(trim(coalesce(p_name,'')))<1 or length(trim(p_name))>160 then raise exception 'INVALID_NAME'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(v_phone_digits)<10 then raise exception 'INVALID_PHONE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':'||lower(trim(p_email))||':'||right(v_phone_digits,10),0));
 select c.id into v_customer_id from public.customers c
 where c.workspace_id=v_workspace_id and lower(c.email::text)=lower(trim(p_email))
 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10)
 order by c.created_at limit 1 for update;
 if v_customer_id is not null then return v_customer_id; end if;
 v_first_name:=split_part(trim(p_name),' ',1); v_last_name:=nullif(trim(substr(trim(p_name),length(v_first_name)+1)),'');
 insert into public.customers(workspace_id,first_name,last_name,email,phone,address_line1,metadata)
 values(v_workspace_id,v_first_name,coalesce(v_last_name,''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_address),''),
 jsonb_build_object('source','public_booking','identity_match','email_phone'))
 returning id into v_customer_id;
 return v_customer_id;
end $$;

create or replace function public.public_booking_upsert_vehicle(
 p_booking_slug text,p_customer_email text,p_year integer,p_make text,p_model text,p_license_plate text default null,
 p_vin text default null,p_mileage integer default null,p_oil_type text default null,p_oil_capacity text default null,
 p_image_url text default null,p_engine text default null,p_customer_phone text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_business_user_id uuid;v_workspace_id uuid;v_customer_id uuid;v_phone_digits text;
begin
 select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if length(v_phone_digits)<10 then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 select c.id into v_customer_id from public.customers c where c.workspace_id=v_workspace_id
 and lower(c.email::text)=lower(trim(p_customer_email))
 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10)
 order by c.created_at limit 1;
 if v_customer_id is null then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 return public.upsert_booking_vehicle(v_business_user_id,v_customer_id,p_year,p_make,p_model,p_license_plate,p_vin,p_mileage,p_oil_type,p_oil_capacity,p_image_url,p_engine);
end $$;

create or replace function public.public_booking_set_vehicle_tire_spec_v3(
 p_booking_slug text,p_customer_email text,p_customer_phone text,p_vehicle_id uuid,p_tire_size text,p_tire_size_source text default null,
 p_tire_size_front text default null,p_tire_size_rear text default null,p_tire_load_index text default null,p_tire_speed_rating text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_business_user_id uuid;v_workspace_id uuid;v_vehicle_workspace uuid;v_customer_id uuid;v_phone_digits text;
begin
 select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if length(v_phone_digits)<10 then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 select c.id into v_customer_id from public.customers c where c.workspace_id=v_workspace_id
 and lower(c.email::text)=lower(trim(p_customer_email))
 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10)
 order by c.created_at limit 1;
 select v.workspace_id into v_vehicle_workspace from public.vehicles v where v.id=p_vehicle_id and v.customer_id is not distinct from v_customer_id;
 if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
 perform public.set_vehicle_tire_spec_v1(v_business_user_id,p_vehicle_id,p_tire_size,p_tire_size_source,p_tire_size_front,p_tire_size_rear,p_tire_load_index,p_tire_speed_rating);
end $$;

revoke all on function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text,text) to anon,authenticated,service_role;
revoke all on function public.public_booking_set_vehicle_tire_spec_v3(text,text,text,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.public_booking_set_vehicle_tire_spec_v3(text,text,text,uuid,text,text,text,text,text,text) to anon,authenticated,service_role;
