-- Restrict post-booking appointment context writes to the fresh appointment
-- created through the same booking slug/workspace. Only the location/dispatch
-- fields required by the public booking flow are mutable through this boundary.

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
  select c.workspace_id
    into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;

  if v_workspace_id is null then
    raise exception 'BOOKING_CONTEXT_INVALID';
  end if;

  select a.workspace_id
    into v_appointment_workspace
  from public.appointments a
  where a.id = p_appointment_id
    and a.source = 'public_booking'
    and a.created_at > now() - interval '30 minutes';

  if v_appointment_workspace is distinct from v_workspace_id then
    raise exception 'INVALID_APPOINTMENT';
  end if;

  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then
    raise exception 'INVALID_LATITUDE';
  end if;

  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then
    raise exception 'INVALID_LONGITUDE';
  end if;

  update public.appointments
  set dispatch_notes = case when p_dispatch_notes is null then dispatch_notes else left(p_dispatch_notes, 4000) end,
      location_address = case when p_location_address is null then location_address else left(p_location_address, 1000) end,
      location_lat = coalesce(p_location_lat, location_lat),
      location_lng = coalesce(p_location_lng, location_lng),
      updated_at = now()
  where id = p_appointment_id
    and workspace_id = v_workspace_id;
end;
$$;

revoke all on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) from public;
grant execute on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) to anon, authenticated;
alter function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) set search_path = '';
