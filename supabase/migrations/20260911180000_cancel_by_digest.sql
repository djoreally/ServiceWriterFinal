-- Shot 17: verify appointment cancellation links by digest, never plaintext metadata.
begin;

create or replace function public.cancel_appointment_by_token(
  p_management_token text,
  p_cancellation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_token_id uuid;
  v_now timestamptz := now();
  v_digest text;
begin
  if nullif(trim(p_management_token), '') is null then
    return pg_catalog.jsonb_build_object('success', false, 'message', 'Appointment link is invalid.');
  end if;

  v_digest := pg_catalog.encode(
    extensions.digest(trim(p_management_token), 'sha256'),
    'hex'
  );

  select a, t.id
    into v_appointment, v_token_id
  from public.appointment_management_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_digest = v_digest
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > v_now)
  limit 1
  for update of t, a;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'message', 'Appointment link is invalid or expired.');
  end if;

  if v_appointment.status in ('cancelled','completed','no_show') then
    return pg_catalog.jsonb_build_object('success', false, 'message', 'This appointment can no longer be cancelled.');
  end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id = v_appointment.workspace_id;

  if coalesce(v_settings.allow_cancellation, true) is false then
    return pg_catalog.jsonb_build_object('success', false, 'message', 'Online cancellation is disabled for this shop.');
  end if;

  if v_appointment.starts_at <= v_now + pg_catalog.make_interval(hours => coalesce(v_settings.cancellation_window_hours, 24)) then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'message', pg_catalog.format('Cancellations must be made at least %s hours before the appointment.', coalesce(v_settings.cancellation_window_hours, 24))
    );
  end if;

  update public.appointments
  set status='cancelled',
      metadata=coalesce(metadata,'{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'cancellation_reason',nullif(trim(coalesce(p_cancellation_reason,'')),''),
          'cancelled_at',v_now,
          'cancelled_by','customer_management_token'
        ),
      updated_at=v_now
  where id=v_appointment.id;

  update public.appointment_management_tokens
  set last_used_at=v_now,
      use_count=use_count+1,
      revoked_at=v_now,
      updated_at=v_now
  where appointment_id=v_appointment.id
    and revoked_at is null;

  return pg_catalog.jsonb_build_object(
    'success',true,
    'appointment_id',v_appointment.id,
    'status','cancelled'
  );
end;
$function$;

revoke all on function public.cancel_appointment_by_token(text,text) from public;
grant execute on function public.cancel_appointment_by_token(text,text) to anon, authenticated, service_role;

commit;
