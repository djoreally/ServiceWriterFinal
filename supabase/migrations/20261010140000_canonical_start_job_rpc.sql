-- Phase 3 (2026-10-10): one canonical Start Job implementation.
--
-- start_appointment_job_v1 owns the start transition end to end: row-level
-- locking (SELECT ... FOR UPDATE), the confirm-on-start transition policy,
-- idempotent replay via Idempotency-Key, and the dispatch audit event.
-- Every Start Job caller (appointment detail, tech app, dispatch views) goes
-- through POST /v1/appointments/:id/start, which delegates here. The older
-- technician_transition_job_v1 start branch is superseded for appointments
-- (kept for its other transitions, not deleted).
--
-- This migration also hardens complete_appointment_v1: it now validates the
-- complete transition (only in_progress -> completed), records
-- metadata.actual_end_time, and stamps metadata.dispatch_status='completed'
-- so both complete paths (job-transition RPC and /complete endpoint) behave
-- identically. Re-completing an already-completed appointment is idempotent.

-- ---------------------------------------------------------------------------
-- start_appointment_job_v1
-- ---------------------------------------------------------------------------

create or replace function public.start_appointment_job_v1(
  p_workspace_id uuid,
  p_appointment_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_appt public.appointments%rowtype;
  v_now timestamptz := now();
  v_now_text text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if p_appointment_id is null then raise exception 'Appointment id required'; end if;

  -- Idempotent replay: a retried request carrying the same key (double-tap,
  -- offline replay, timeout retry) returns the stored result instead of
  -- re-executing the transition.
  if v_key is not null then
    select i.result into v_result
      from public.technician_job_transition_idempotency i
     where i.actor_user_id = v_actor and i.idempotency_key = v_key;
    if found then return v_result || jsonb_build_object('replayed', true); end if;
  end if;

  -- Row-level lock: the status check and the update below are atomic. A
  -- double-tap (or two techs on the same job) serializes here; the loser
  -- re-reads and gets already_started instead of racing the metadata merge.
  select * into v_appt from public.appointments
   where id = p_appointment_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'NOT_FOUND: Appointment not found'; end if;

  -- A technician may only start their own assignment; office roles may start any job.
  if v_appt.assigned_user_id is distinct from v_actor
     and not exists (
       select 1 from public.workspace_members wm
        where wm.workspace_id = p_workspace_id and wm.user_id = v_actor and wm.is_active
          and wm.role::text = any(array['owner','admin','manager','service_advisor','dispatcher'])
     )
  then raise exception 'Job is assigned to another technician'; end if;

  if v_appt.status::text = 'in_progress' then
    -- Already started: success, not an error. Keeps double-tap idempotent
    -- even when the caller did not send an idempotency key.
    v_result := jsonb_build_object(
      'replayed', false, 'job_id', p_appointment_id, 'source', 'appointment',
      'status', 'in_progress', 'already_started', true, 'updated_at', v_appt.updated_at);
  else
    -- Canonical start policy (confirm-on-start), encoded here and ONLY here:
    -- an unconfirmed appointment in "requested" status MAY be started — starting
    -- it implicitly confirms it, because the owner starts unconfirmed
    -- appointments in practice. Only terminal states are blocked.
    if v_appt.status::text in ('completed', 'cancelled', 'no_show') then
      raise exception 'INVALID_TRANSITION: This appointment can no longer be started.';
    end if;
    if v_appt.customer_id is null or v_appt.vehicle_id is null then
      raise exception 'MISSING_JOB_CONTEXT: Start Job requires customer and vehicle context.';
    end if;

    update public.appointments
       set status = 'in_progress'::public.appointment_status,
           metadata = jsonb_set(
             jsonb_set(
               coalesce(metadata, '{}'::jsonb),
               '{dispatch_status}', to_jsonb('started'::text), true),
             '{actual_start_time}',
             to_jsonb(coalesce(metadata->>'actual_start_time', v_now_text)), true),
           updated_at = v_now
     where id = p_appointment_id and workspace_id = p_workspace_id;

    insert into public.dispatch_events(
      workspace_id, appointment_id, technician_id, event_type,
      previous_status, new_status, notes, performed_by)
    values (
      p_workspace_id, p_appointment_id, coalesce(v_appt.assigned_user_id, v_actor),
      'started', v_appt.status::text, 'in_progress', null, v_actor);

    v_result := jsonb_build_object(
      'replayed', false, 'job_id', p_appointment_id, 'source', 'appointment',
      'status', 'in_progress', 'already_started', false, 'updated_at', v_now);
  end if;

  -- The idempotency record is written LAST so a failed attempt can never make
  -- a retry look successful.
  if v_key is not null then
    insert into public.technician_job_transition_idempotency(
      actor_user_id, idempotency_key, workspace_id, job_source, job_id, next_status, result)
    values (
      v_actor, v_key, p_workspace_id, 'appointment', p_appointment_id, 'in_progress', v_result)
    on conflict (actor_user_id, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

revoke all on function public.start_appointment_job_v1(uuid, uuid, text) from public, anon;
grant execute on function public.start_appointment_job_v1(uuid, uuid, text) to authenticated, service_role;
comment on function public.start_appointment_job_v1(uuid, uuid, text) is
  'Canonical Start Job: row-locked, idempotent appointment start with confirm-on-start policy. Called by POST /v1/appointments/:id/start.';

-- ---------------------------------------------------------------------------
-- complete_appointment_v1 — hardened: transition validation, actual_end_time,
-- dispatch_status, idempotent re-entry.
-- ---------------------------------------------------------------------------

create or replace function public.complete_appointment_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_record_id uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_tax_rate numeric;
  v_now_text text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_workspace_staff(p_workspace_id) then
    raise exception 'Workspace staff access required';
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'Appointment not found';
  end if;

  -- Canonical complete policy, encoded here and ONLY here: only an in-progress
  -- appointment can be completed. Re-completing an already-completed
  -- appointment is idempotent and returns the existing service record instead
  -- of erroring (double-tap safe).
  if v_appt.status::text = 'completed' then
    select id into v_record_id
    from public.service_records
    where workspace_id = p_workspace_id and appointment_id = p_appointment_id
    order by created_at asc
    limit 1;
    if v_record_id is not null then
      return v_record_id;
    end if;
    -- Legacy completed row with no service record: fall through and create one.
  elsif v_appt.status::text <> 'in_progress' then
    raise exception 'INVALID_TRANSITION: Only an in-progress appointment can be completed';
  end if;

  update public.appointments
  set status = 'completed',
      metadata = jsonb_set(
        jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{actual_end_time}',
          to_jsonb(coalesce(metadata->>'actual_end_time', v_now_text)), true),
        '{dispatch_status}', to_jsonb('completed'::text), true),
      updated_at = now()
  where id = p_appointment_id and workspace_id = p_workspace_id;

  select id into v_record_id
  from public.service_records
  where workspace_id = p_workspace_id and appointment_id = p_appointment_id
  order by created_at asc
  limit 1;

  if v_record_id is not null then
    update public.service_records
    set status = 'completed', completed_by = coalesce(completed_by, v_actor),
        completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = v_record_id;
    return v_record_id;
  end if;

  v_subtotal := case when jsonb_typeof(v_appt.metadata->'estimated_cost') = 'number'
    then (v_appt.metadata->>'estimated_cost')::numeric else null end;
  v_tax := case when jsonb_typeof(v_appt.metadata->'tax_amount') = 'number'
    then (v_appt.metadata->>'tax_amount')::numeric else null end;
  select tax_rate into v_tax_rate from public.workspace_settings where workspace_id = p_workspace_id;

  insert into public.service_records(
    workspace_id, appointment_id, customer_id, vehicle_id,
    completed_by, status, work_performed, customer_notes, metadata,
    completed_at, subtotal, tax_rate, tax_amount, total_amount, currency_code
  ) values (
    p_workspace_id, p_appointment_id, v_appt.customer_id, v_appt.vehicle_id,
    v_actor, 'completed',
    coalesce(nullif(v_appt.metadata->>'description',''), nullif(v_appt.metadata->>'title',''), v_appt.notes, 'Completed appointment'),
    v_appt.notes,
    jsonb_build_object('source','appointment_completion','appointment_metadata',coalesce(v_appt.metadata,'{}'::jsonb)),
    now(), v_subtotal, v_tax_rate, v_tax,
    case when v_subtotal is null and v_tax is null then null else coalesce(v_subtotal,0)+coalesce(v_tax,0) end,
    'USD'
  ) returning id into v_record_id;

  return v_record_id;
end;
$$;

comment on function public.complete_appointment_v1(uuid, uuid) is
  'Canonical appointment completion: validates in_progress -> completed, records actual_end_time, idempotent on re-entry. Authenticated staff RPC. SECURITY DEFINER is intentional; function requires auth.uid() and is_workspace_staff(workspace_id) before mutation.';
