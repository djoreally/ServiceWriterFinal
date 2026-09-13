-- Shot 7: replace anonymous abandoned-booking table writes with session-bound RPCs.
-- Prepared detached from main; apply only with the final certified release.

begin;

drop policy if exists abandoned_bookings_public_insert on public.abandoned_bookings;
drop policy if exists abandoned_bookings_public_update_by_session on public.abandoned_bookings;

revoke all on table public.abandoned_bookings from anon;
revoke insert, delete on table public.abandoned_bookings from authenticated;
grant select, update on table public.abandoned_bookings to authenticated;
grant select, insert, update, delete on table public.abandoned_bookings to service_role;

create or replace function public.public_track_abandoned_booking_v1(
  p_business_user_id uuid,
  p_session_id text,
  p_guest_email text default null,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_last_step integer default 0,
  p_service_catalog_id uuid default null,
  p_scheduled_date date default null,
  p_scheduled_time text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace_id uuid;
  v_id uuid;
  v_email text;
begin
  if p_session_id is null
     or length(trim(p_session_id)) < 16
     or length(trim(p_session_id)) > 200 then
    raise exception 'BOOKING_SESSION_INVALID';
  end if;

  if p_last_step < 0 or p_last_step > 20 then
    raise exception 'BOOKING_STEP_INVALID';
  end if;

  if pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 16384 then
    raise exception 'BOOKING_METADATA_TOO_LARGE';
  end if;

  select w.id
    into v_workspace_id
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id
    and w.is_active
    and ws.booking_enabled
  order by w.created_at
  limit 1;

  if v_workspace_id is null then
    raise exception 'BOOKING_CONTEXT_INVALID';
  end if;

  if p_service_catalog_id is not null
     and not exists (
       select 1
       from public.service_catalog sc
       where sc.id = p_service_catalog_id
         and sc.workspace_id = v_workspace_id
         and sc.is_active
     ) then
    raise exception 'BOOKING_SERVICE_INVALID';
  end if;

  v_email := nullif(lower(trim(coalesce(p_guest_email, ''))), '');
  if v_email is not null
     and (length(v_email) > 320 or position('@' in v_email) < 2) then
    raise exception 'BOOKING_EMAIL_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_business_user_id::text || ':' || trim(p_session_id), 0)
  );

  select ab.id
    into v_id
  from public.abandoned_bookings ab
  where ab.user_id = p_business_user_id
    and ab.session_id = trim(p_session_id)
    and ab.recovered = false
  order by ab.created_at desc
  limit 1
  for update;

  if v_id is not null then
    update public.abandoned_bookings
    set guest_email = coalesce(v_email, guest_email),
        guest_name = coalesce(nullif(trim(coalesce(p_guest_name, '')), ''), guest_name),
        guest_phone = coalesce(nullif(trim(coalesce(p_guest_phone, '')), ''), guest_phone),
        last_step = p_last_step,
        service_catalog_id = p_service_catalog_id,
        scheduled_date = p_scheduled_date,
        scheduled_time = p_scheduled_time,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        status = 'pending',
        last_attempted_at = now(),
        attempt_count = greatest(1, attempt_count + 1)
    where id = v_id;
    return v_id;
  end if;

  begin
    insert into public.abandoned_bookings(
      user_id,
      guest_email,
      guest_name,
      guest_phone,
      session_id,
      service_catalog_id,
      scheduled_date,
      scheduled_time,
      last_step,
      attempt_count,
      status,
      recovered,
      last_attempted_at,
      metadata
    )
    values (
      p_business_user_id,
      v_email,
      nullif(trim(coalesce(p_guest_name, '')), ''),
      nullif(trim(coalesce(p_guest_phone, '')), ''),
      trim(p_session_id),
      p_service_catalog_id,
      p_scheduled_date,
      p_scheduled_time,
      p_last_step,
      1,
      'pending',
      false,
      now(),
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Never merge a different anonymous session into an existing email row.
      -- Tracking is best-effort and must not become an account-enumeration or
      -- cross-session mutation primitive.
      return null;
  end;

  return v_id;
end;
$function$;

create or replace function public.public_recover_abandoned_booking_v1(
  p_business_user_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace_id uuid;
begin
  if p_session_id is null
     or length(trim(p_session_id)) < 16
     or length(trim(p_session_id)) > 200 then
    return false;
  end if;

  select w.id
    into v_workspace_id
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id
    and w.is_active
    and ws.booking_enabled
  order by w.created_at
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  update public.abandoned_bookings
  set recovered = true,
      status = 'recovered',
      recovered_at = now()
  where user_id = p_business_user_id
    and session_id = trim(p_session_id)
    and recovered = false
    and status in ('pending', 'processing', 'emailed');

  return found;
end;
$function$;

revoke all on function public.public_track_abandoned_booking_v1(
  uuid,text,text,text,text,integer,uuid,date,text,jsonb
) from public;
revoke all on function public.public_recover_abandoned_booking_v1(uuid,text) from public;

grant execute on function public.public_track_abandoned_booking_v1(
  uuid,text,text,text,text,integer,uuid,date,text,jsonb
) to anon, authenticated;
grant execute on function public.public_recover_abandoned_booking_v1(uuid,text)
  to anon, authenticated;

comment on function public.public_track_abandoned_booking_v1(
  uuid,text,text,text,text,integer,uuid,date,text,jsonb
) is 'Session-bound public booking funnel tracking; no direct anonymous table writes.';
comment on function public.public_recover_abandoned_booking_v1(uuid,text)
  is 'Session-bound recovery marker for public booking funnel tracking.';

commit;
