-- Harden appointment creation: bind customer by email+phone and make initial price/tax non-authoritative.
create or replace function public.public_booking_book_appointment_v2(
 p_booking_slug text,p_scheduled_date date,p_scheduled_time time,p_duration_minutes integer,p_title text,
 p_guest_name text,p_guest_email text,p_guest_phone text,p_description text,p_notes text,
 p_estimated_cost numeric,p_tax_amount numeric,p_service_catalog_id uuid,p_vehicle_id uuid,p_status text default 'confirmed'
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid;v_customer_id uuid;v_phone_digits text;v_vehicle_workspace uuid;v_service_workspace uuid;
v_timezone text;v_settings public.workspace_settings%rowtype;v_appointment_id uuid;v_starts_at timestamptz;v_ends_at timestamptz;v_status public.appointment_status;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 if p_duration_minutes is null or p_duration_minutes<1 or p_duration_minutes>1440 then raise exception 'INVALID_DURATION'; end if;
 if length(trim(coalesce(p_guest_email,'')))<3 or position('@' in p_guest_email)<2 then raise exception 'INVALID_EMAIL'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g'); if length(v_phone_digits)<10 then raise exception 'INVALID_PHONE'; end if;
 select c.id into v_customer_id from public.customers c where c.workspace_id=v_workspace_id and lower(c.email::text)=lower(trim(p_guest_email))
 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10) order by c.created_at limit 1;
 if v_customer_id is null then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if p_vehicle_id is null then raise exception 'BOOKING_VEHICLE_REQUIRED'; end if;
 select v.workspace_id into v_vehicle_workspace from public.vehicles v where v.id=p_vehicle_id and v.customer_id=v_customer_id;
 if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
 if p_service_catalog_id is not null then select s.workspace_id into v_service_workspace from public.service_catalog s where s.id=p_service_catalog_id and s.is_active;
 if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if; end if;
 select w.timezone into v_timezone from public.workspaces w where w.id=v_workspace_id;
 select * into v_settings from public.workspace_settings where workspace_id=v_workspace_id;
 v_starts_at:=(p_scheduled_date+p_scheduled_time) at time zone v_timezone;v_ends_at:=v_starts_at+make_interval(mins=>p_duration_minutes);
 if v_starts_at<now()+make_interval(hours=>coalesce(v_settings.min_lead_time_hours,0)) or v_starts_at>now()+make_interval(days=>coalesce(v_settings.max_advance_days,365)) then raise exception 'DATE_BLOCKED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':'||v_starts_at::text,0));
 if exists(select 1 from public.appointments a where a.workspace_id=v_workspace_id and a.status::text not in('cancelled','no_show') and a.starts_at<v_ends_at and a.ends_at>v_starts_at) then raise exception 'SLOT_UNAVAILABLE'; end if;
 v_status:=case when p_status in('confirmed','scheduled') then 'confirmed'::public.appointment_status else 'requested'::public.appointment_status end;
 insert into public.appointments(workspace_id,customer_id,vehicle_id,status,starts_at,ends_at,source,confirmation_code,notes,metadata)
 values(v_workspace_id,v_customer_id,p_vehicle_id,v_status,v_starts_at,v_ends_at,'public_booking',upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_notes,
 jsonb_strip_nulls(jsonb_build_object('title',left(coalesce(p_title,'Online booking'),500),'guest_name',left(p_guest_name,160),'guest_email',lower(trim(p_guest_email)),
 'guest_phone',p_guest_phone,'description',p_description,'estimated_cost',0,'tax_amount',0,'service_catalog_id',p_service_catalog_id,
 'pricing_state','pending_canonical_items','client_estimated_cost',round(greatest(coalesce(p_estimated_cost,0),0),2),'client_tax_amount',round(greatest(coalesce(p_tax_amount,0),0),2))))
 returning id into v_appointment_id; return v_appointment_id;
end $$;
revoke all on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon,authenticated,service_role;
