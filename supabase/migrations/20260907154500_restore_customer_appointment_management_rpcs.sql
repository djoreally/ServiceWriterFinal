begin;

create or replace function public.cancel_appointment_by_token(
  p_management_token text,
  p_cancellation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_now timestamptz := now();
begin
  if nullif(trim(p_management_token), '') is null then
    return jsonb_build_object('success', false, 'message', 'A valid appointment management token is required.');
  end if;
  select * into v_appointment from public.appointments where metadata ->> 'management_token' = p_management_token limit 1 for update;
  if not found then return jsonb_build_object('success', false, 'message', 'Appointment not found or management link is invalid.'); end if;
  if v_appointment.status in ('cancelled','completed','no_show') then return jsonb_build_object('success', false, 'message', 'This appointment can no longer be cancelled.'); end if;
  select * into v_settings from public.workspace_settings where workspace_id = v_appointment.workspace_id;
  if coalesce(v_settings.allow_cancellation, true) is false then return jsonb_build_object('success', false, 'message', 'Online cancellation is disabled for this shop.'); end if;
  if v_appointment.starts_at <= v_now + make_interval(hours => coalesce(v_settings.cancellation_window_hours, 24)) then return jsonb_build_object('success', false, 'message', format('Cancellations must be made at least %s hours before the appointment.', coalesce(v_settings.cancellation_window_hours, 24))); end if;
  update public.appointments set status='cancelled', metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancellation_reason',nullif(trim(coalesce(p_cancellation_reason,'')),''),'cancelled_at',v_now,'cancelled_by','customer_management_token'), updated_at=v_now where id=v_appointment.id;
  return jsonb_build_object('success',true,'appointment_id',v_appointment.id,'status','cancelled');
end;
$function$;

create or replace function public.reschedule_appointment_by_token(
  p_management_token text,
  p_new_date date,
  p_new_time time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_workspace public.workspaces%rowtype;
  v_timezone text; v_new_start timestamptz; v_new_end timestamptz; v_duration interval; v_now timestamptz:=now(); v_day text;
begin
  if nullif(trim(p_management_token),'') is null then return jsonb_build_object('success',false,'message','A valid appointment management token is required.'); end if;
  select * into v_appointment from public.appointments where metadata->>'management_token'=p_management_token limit 1 for update;
  if not found then return jsonb_build_object('success',false,'message','Appointment not found or management link is invalid.'); end if;
  if v_appointment.status in ('cancelled','completed','no_show','in_progress') then return jsonb_build_object('success',false,'message','This appointment can no longer be rescheduled.'); end if;
  select * into v_settings from public.workspace_settings where workspace_id=v_appointment.workspace_id;
  select * into v_workspace from public.workspaces where id=v_appointment.workspace_id;
  if coalesce(v_settings.allow_rescheduling,true) is false then return jsonb_build_object('success',false,'message','Online rescheduling is disabled for this shop.'); end if;
  if v_appointment.starts_at <= v_now + make_interval(hours=>coalesce(v_settings.reschedule_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Rescheduling must be done at least %s hours before the appointment.',coalesce(v_settings.reschedule_window_hours,24))); end if;
  v_timezone:=coalesce(nullif(v_workspace.timezone,''),'UTC'); v_new_start:=(p_new_date+p_new_time) at time zone v_timezone; v_duration:=v_appointment.ends_at-v_appointment.starts_at; v_new_end:=v_new_start+v_duration; v_day:=lower(to_char(p_new_date,'FMDay'));
  if v_new_start<=v_now then return jsonb_build_object('success',false,'message','Choose a future appointment time.'); end if;
  if v_new_start < v_now + make_interval(hours=>coalesce(v_settings.min_lead_time_hours,0)) then return jsonb_build_object('success',false,'message','The selected time is inside the shop minimum lead-time window.'); end if;
  if p_new_date > (v_now at time zone v_timezone)::date + coalesce(v_settings.max_advance_days,30) then return jsonb_build_object('success',false,'message','The selected date is outside the booking window.'); end if;
  if v_settings.working_days is not null and array_length(v_settings.working_days,1) is not null and not exists(select 1 from unnest(v_settings.working_days)d where lower(d)=v_day) then return jsonb_build_object('success',false,'message','The shop is closed on the selected day.'); end if;
  if p_new_time < coalesce(v_settings.opening_time,time '00:00') or p_new_time >= coalesce(v_settings.closing_time,time '23:59:59') then return jsonb_build_object('success',false,'message','The selected time is outside business hours.'); end if;
  if exists(select 1 from public.appointments a where a.workspace_id=v_appointment.workspace_id and a.id<>v_appointment.id and a.status not in ('cancelled','no_show') and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(v_new_start,v_new_end,'[)')) then return jsonb_build_object('success',false,'message','That time is no longer available. Please choose another time.'); end if;
  update public.appointments set starts_at=v_new_start,ends_at=v_new_end,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rescheduled_at',v_now,'rescheduled_by','customer_management_token','previous_starts_at',v_appointment.starts_at),updated_at=v_now where id=v_appointment.id;
  return jsonb_build_object('success',true,'appointment_id',v_appointment.id,'starts_at',v_new_start,'ends_at',v_new_end);
end;
$function$;

revoke all on function public.cancel_appointment_by_token(text,text) from public;
revoke all on function public.reschedule_appointment_by_token(text,date,time without time zone) from public;
grant execute on function public.cancel_appointment_by_token(text,text) to anon, authenticated, service_role;
grant execute on function public.reschedule_appointment_by_token(text,date,time without time zone) to anon, authenticated, service_role;

commit;
