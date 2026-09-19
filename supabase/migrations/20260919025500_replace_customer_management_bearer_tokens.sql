-- Customer portal is authenticated; manage appointments by ID + linked customer identity, not bearer tokens.
create or replace function public.cancel_customer_appointment_v2(p_appointment_id uuid,p_cancellation_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_a public.appointments%rowtype;v_s public.workspace_settings%rowtype;v_now timestamptz:=now();
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.* into v_a from public.appointments a where a.id=p_appointment_id and exists(
 select 1 from public.customer_users cu where cu.user_id=v_uid and cu.customer_id=a.customer_id and cu.workspace_id=a.workspace_id) for update;
 if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 if v_a.status in('cancelled','completed','no_show') then return jsonb_build_object('success',false,'message','This appointment can no longer be cancelled.'); end if;
 select * into v_s from public.workspace_settings where workspace_id=v_a.workspace_id;
 if coalesce(v_s.allow_cancellation,true)=false then return jsonb_build_object('success',false,'message','Online cancellation is disabled for this shop.'); end if;
 if v_a.starts_at<=v_now+make_interval(hours=>coalesce(v_s.cancellation_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Cancellations must be made at least %s hours before the appointment.',coalesce(v_s.cancellation_window_hours,24))); end if;
 update public.appointments set status='cancelled',metadata=(coalesce(metadata,'{}'::jsonb)-'management_token')||jsonb_build_object('cancellation_reason',nullif(trim(coalesce(p_cancellation_reason,'')),''),'cancelled_at',v_now,'cancelled_by','customer_portal'),updated_at=v_now where id=v_a.id;
 return jsonb_build_object('success',true,'appointment_id',v_a.id,'status','cancelled');
end $$;
revoke all on function public.cancel_customer_appointment_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_customer_appointment_v2(uuid,text) to authenticated,service_role;

create or replace function public.reschedule_customer_appointment_v2(p_appointment_id uuid,p_new_date date,p_new_time time)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_a public.appointments%rowtype;v_s public.workspace_settings%rowtype;v_w public.workspaces%rowtype;v_tz text;v_start timestamptz;v_end timestamptz;v_now timestamptz:=now();v_day text;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.* into v_a from public.appointments a where a.id=p_appointment_id and exists(
 select 1 from public.customer_users cu where cu.user_id=v_uid and cu.customer_id=a.customer_id and cu.workspace_id=a.workspace_id) for update;
 if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 if v_a.status in('cancelled','completed','no_show','in_progress') then return jsonb_build_object('success',false,'message','This appointment can no longer be rescheduled.'); end if;
 select * into v_s from public.workspace_settings where workspace_id=v_a.workspace_id;select * into v_w from public.workspaces where id=v_a.workspace_id;
 if coalesce(v_s.allow_rescheduling,true)=false then return jsonb_build_object('success',false,'message','Online rescheduling is disabled for this shop.'); end if;
 if v_a.starts_at<=v_now+make_interval(hours=>coalesce(v_s.reschedule_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Rescheduling must be done at least %s hours before the appointment.',coalesce(v_s.reschedule_window_hours,24))); end if;
 v_tz:=coalesce(nullif(v_w.timezone,''),'UTC');v_start:=(p_new_date+p_new_time) at time zone v_tz;v_end:=v_start+(v_a.ends_at-v_a.starts_at);v_day:=lower(to_char(p_new_date,'FMDay'));
 if v_start<=v_now or v_start<v_now+make_interval(hours=>coalesce(v_s.min_lead_time_hours,0)) then return jsonb_build_object('success',false,'message','The selected time is inside the booking lead-time window.'); end if;
 if p_new_date>(v_now at time zone v_tz)::date+coalesce(v_s.max_advance_days,30) then return jsonb_build_object('success',false,'message','The selected date is outside the booking window.'); end if;
 if v_s.working_days is not null and array_length(v_s.working_days,1) is not null and not exists(select 1 from unnest(v_s.working_days)d where lower(d)=v_day) then return jsonb_build_object('success',false,'message','The shop is closed on the selected day.'); end if;
 if p_new_time<coalesce(v_s.opening_time,time '00:00') or p_new_time>=coalesce(v_s.closing_time,time '23:59:59') then return jsonb_build_object('success',false,'message','The selected time is outside business hours.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_a.workspace_id::text||':'||v_start::text,0));
 if exists(select 1 from public.appointments a where a.workspace_id=v_a.workspace_id and a.id<>v_a.id and a.status not in('cancelled','no_show') and a.starts_at<v_end and a.ends_at>v_start) then return jsonb_build_object('success',false,'message','That time is no longer available. Please choose another time.'); end if;
 update public.appointments set starts_at=v_start,ends_at=v_end,metadata=(coalesce(metadata,'{}'::jsonb)-'management_token')||jsonb_build_object('rescheduled_at',v_now,'rescheduled_by','customer_portal','previous_starts_at',v_a.starts_at),updated_at=v_now where id=v_a.id;
 return jsonb_build_object('success',true,'appointment_id',v_a.id,'starts_at',v_start,'ends_at',v_end);
end $$;
revoke all on function public.reschedule_customer_appointment_v2(uuid,date,time) from public,anon,authenticated;
grant execute on function public.reschedule_customer_appointment_v2(uuid,date,time) to authenticated,service_role;

revoke all on function public.cancel_appointment_by_token(text,text) from public,anon,authenticated;
revoke all on function public.reschedule_appointment_by_token(text,date,time) from public,anon,authenticated;
