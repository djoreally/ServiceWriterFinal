-- Tech app job flow (Ty's approved flow, 2026-11-12): the canonical
-- technician transition gains an ordered travel leg and a shift gate.
--
-- What this migration does:
-- 1. technician_transition_job_v2 — a NEW version beside v1 (v1 stays
--    for its existing callers). Differences from v1
--    (20261112025500 body, otherwise carried over):
--    - ORDER: en_route is only allowed from dispatch_status
--      'assigned'; arrived only from 'en_route'; a job that is
--      en_route cannot start work — it must arrive first. A job
--      whose dispatch_status is still 'assigned' may still start
--      directly (jobs that never take the travel leg are not
--      stranded by the new order).
--    - TRAVEL RECORD: en_route stamps metadata.en_route_at (+ the
--      tap location when the caller passes p_lat/p_lng); arrived
--      stamps metadata.arrived_at (+ location) and computes
--      metadata.travel_duration_seconds from the pair. When BOTH
--      tap locations exist, metadata.travel_distance_miles is the
--      haversine distance between them and
--      metadata.travel_distance_captured is true; otherwise the
--      distance key is removed and travel_distance_captured is
--      false — a missing location is recorded as not captured,
--      never estimated.
--    - SHIFT GATE: en_route and start transitions require an open
--      shift for the actor — a public.time_clock_entries row with
--      clock_out null, the exact "current shift" definition the
--      production clock_in RPC (Step 4 family) and
--      GET /v1/time-clock already use. No open shift raises
--      CLOCK_IN_REQUIRED.
--    - The appointments.dispatch_status COLUMN is stamped alongside
--      metadata (v1 wrote metadata only; the tech-app jobs door
--      reads the column first).
-- 2. service_playbooks + service_playbook_templates gain a
--    `components` jsonb (what a service includes, item by item) —
--    the sibling of the existing `steps` jsonb (how it is done).
-- 3. service_playbook_templates gains an authenticated SELECT
--    policy. The templates are global, non-tenant reference data
--    (SOP text); the Step 8 pass left them service-role-only
--    because their only reader was the admin seed. The tech app is
--    a staff client and must read the fallback SOP directly.
--    Writes remain service-role only — no insert/update/delete
--    policy is added.
-- 4. Seed: the Oil Change Service template (components + SOP
--    steps), inserted only when absent.

-- ---------------------------------------------------------------------
-- 1. technician_transition_job_v2
-- ---------------------------------------------------------------------

create or replace function public.technician_transition_job_v2(
  p_job_id uuid,
  p_source text,
  p_next_status text,
  p_notes text default null,
  p_idempotency_key text default null,
  p_expected_updated_at timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_source text;
  v_next text := lower(trim(coalesce(p_next_status,'')));
  v_workspace_id uuid;
  v_current_status text;
  v_dispatch_status text;
  v_updated_at timestamptz;
  v_assigned_user_id uuid;
  v_result jsonb;
  v_event_type text;
  v_metadata jsonb;
  v_now_iso text := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_en_route_at timestamptz;
  v_distance_miles double precision;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_job_id is null then raise exception 'Job id required'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotency key required'; end if;

  v_source := case lower(trim(coalesce(p_source,'')))
    when 'appointment' then 'appointment'
    when 'work_order' then 'work_order'
    when 'fleet_work_order' then 'work_order'
    else null
  end;
  if v_source is null then raise exception 'Unsupported job source'; end if;

  select i.result into v_result
  from public.technician_job_transition_idempotency i
  where i.actor_user_id=v_actor and i.idempotency_key=p_idempotency_key;
  if found then return v_result || jsonb_build_object('replayed',true); end if;

  -- Shift gate (travel + start transitions only): the actor must
  -- hold an open shift. Completion is deliberately NOT gated — a
  -- tech who clocked out mid-job must still be able to close it.
  if v_next in ('en_route','in_progress','started') then
    if not exists (
      select 1 from public.time_clock_entries t
      where t.user_id=v_actor and t.clock_out is null
    ) then raise exception 'CLOCK_IN_REQUIRED: Clock in for your shift before starting a job'; end if;
  end if;

  if v_source='appointment' then
    select a.workspace_id,a.status::text,coalesce(a.metadata->>'dispatch_status','assigned'),a.updated_at,a.assigned_user_id,coalesce(a.metadata,'{}'::jsonb)
      into v_workspace_id,v_current_status,v_dispatch_status,v_updated_at,v_assigned_user_id,v_metadata
    from public.appointments a where a.id=p_job_id for update;
    if not found then raise exception 'Job not found'; end if;

    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id=v_workspace_id and wm.user_id=v_actor and wm.is_active
        and wm.role::text=any(array['technician','owner','admin','manager','service_advisor','dispatcher'])
    ) then raise exception 'Technician transition access denied'; end if;
    if v_assigned_user_id is distinct from v_actor
       and not exists (
         select 1 from public.workspace_members wm
         where wm.workspace_id=v_workspace_id and wm.user_id=v_actor and wm.is_active
           and wm.role::text=any(array['owner','admin','manager','service_advisor','dispatcher'])
       )
    then raise exception 'Job is assigned to another technician'; end if;

    if p_expected_updated_at is not null and v_updated_at is distinct from p_expected_updated_at
      then raise exception 'CONFLICT_ERROR: Job changed since it was loaded'; end if;

    if v_next = 'en_route' then
      if v_current_status not in ('requested','confirmed','checked_in')
        then raise exception 'INVALID_TRANSITION: Cannot go en route from current appointment status'; end if;
      if v_dispatch_status <> 'assigned'
        then raise exception 'INVALID_TRANSITION: En route requires an assigned job (current dispatch status: %)', v_dispatch_status; end if;
      v_metadata := jsonb_set(v_metadata,'{dispatch_status}',to_jsonb('en_route'::text),true);
      v_metadata := jsonb_set(v_metadata,'{en_route_at}',to_jsonb(v_now_iso),true);
      if p_lat is not null and p_lng is not null then
        v_metadata := jsonb_set(v_metadata,'{en_route_lat}',to_jsonb(p_lat),true);
        v_metadata := jsonb_set(v_metadata,'{en_route_lng}',to_jsonb(p_lng),true);
      end if;
      update public.appointments set metadata=v_metadata, dispatch_status='en_route', updated_at=now()
      where id=p_job_id;
      v_event_type:='en_route';
    elsif v_next = 'arrived' then
      if v_dispatch_status <> 'en_route'
        then raise exception 'INVALID_TRANSITION: Arrival requires the job to be en route first'; end if;
      v_metadata := jsonb_set(v_metadata,'{dispatch_status}',to_jsonb('arrived'::text),true);
      v_metadata := jsonb_set(v_metadata,'{arrived_at}',to_jsonb(v_now_iso),true);
      if p_lat is not null and p_lng is not null then
        v_metadata := jsonb_set(v_metadata,'{arrived_lat}',to_jsonb(p_lat),true);
        v_metadata := jsonb_set(v_metadata,'{arrived_lng}',to_jsonb(p_lng),true);
      end if;
      v_en_route_at := nullif(v_metadata->>'en_route_at','')::timestamptz;
      if v_en_route_at is not null then
        v_metadata := jsonb_set(v_metadata,'{travel_duration_seconds}',
          to_jsonb(greatest(0, extract(epoch from (now() - v_en_route_at))::integer)),true);
      end if;
      if (v_metadata->>'en_route_lat') is not null and (v_metadata->>'en_route_lng') is not null
         and p_lat is not null and p_lng is not null then
        -- Haversine, statute miles (earth radius 3958.8).
        v_distance_miles := 3958.8 * acos(
          least(1.0, greatest(-1.0,
            cos(radians((v_metadata->>'en_route_lat')::double precision)) * cos(radians(p_lat)) *
            cos(radians(p_lng) - radians((v_metadata->>'en_route_lng')::double precision)) +
            sin(radians((v_metadata->>'en_route_lat')::double precision)) * sin(radians(p_lat))
          ))
        );
        v_metadata := jsonb_set(v_metadata,'{travel_distance_miles}',to_jsonb(round(v_distance_miles::numeric, 2)),true);
        v_metadata := jsonb_set(v_metadata,'{travel_distance_captured}',to_jsonb(true),true);
      else
        v_metadata := (v_metadata - 'travel_distance_miles');
        v_metadata := jsonb_set(v_metadata,'{travel_distance_captured}',to_jsonb(false),true);
      end if;
      update public.appointments set metadata=v_metadata, dispatch_status='arrived', updated_at=now()
      where id=p_job_id;
      v_event_type:='arrived';
    elsif v_next in ('in_progress','started') then
      if v_current_status not in ('confirmed','checked_in','in_progress')
        then raise exception 'INVALID_TRANSITION: Cannot start appointment from current status'; end if;
      if v_dispatch_status = 'en_route'
        then raise exception 'INVALID_TRANSITION: Tap Arrived before beginning work'; end if;
      if v_dispatch_status not in ('assigned','arrived','started')
        then raise exception 'INVALID_TRANSITION: Cannot start work from dispatch status %', v_dispatch_status; end if;
      update public.appointments set status='in_progress'::public.appointment_status,
        dispatch_status='started',
        metadata=jsonb_set(
          jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('started'::text),true),
          '{actual_start_time}',
          to_jsonb(coalesce(metadata->>'actual_start_time', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))), true),
        updated_at=now()
      where id=p_job_id;
      v_event_type:='started'; v_next:='in_progress';
    elsif v_next in ('completed','complete') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress appointment can be completed'; end if;
      perform public.complete_appointment_closeout_v1(v_workspace_id,p_job_id);
      update public.appointments set
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('completed'::text),true),
        dispatch_status='completed',
        updated_at=now()
      where id=p_job_id;
      v_event_type:='completed'; v_next:='completed';
    else
      raise exception 'INVALID_TRANSITION: Unsupported appointment transition';
    end if;

    insert into public.dispatch_events(workspace_id,appointment_id,technician_id,event_type,previous_status,new_status,notes,performed_by)
    values(v_workspace_id,p_job_id,coalesce(v_assigned_user_id,v_actor),v_event_type,v_current_status,v_next,p_notes,v_actor);

  else
    select wo.workspace_id,wo.status::text,coalesce(wo.metadata->>'dispatch_status','assigned'),wo.updated_at,coalesce(wo.metadata,'{}'::jsonb)
      into v_workspace_id,v_current_status,v_dispatch_status,v_updated_at,v_metadata
    from public.work_orders wo where wo.id=p_job_id for update;
    if not found then raise exception 'Job not found'; end if;

    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id=v_workspace_id and wm.user_id=v_actor and wm.is_active
        and wm.role::text=any(array['technician','owner','admin','manager','service_advisor','dispatcher'])
    ) then raise exception 'Technician transition access denied'; end if;

    select woa.user_id into v_assigned_user_id
    from public.work_order_assignments woa
    where woa.workspace_id=v_workspace_id and woa.work_order_id=p_job_id and woa.unassigned_at is null
    order by woa.assigned_at desc limit 1;
    if v_assigned_user_id is distinct from v_actor
       and not exists (
         select 1 from public.workspace_members wm
         where wm.workspace_id=v_workspace_id and wm.user_id=v_actor and wm.is_active
           and wm.role::text=any(array['owner','admin','manager','service_advisor','dispatcher'])
       )
    then raise exception 'Job is assigned to another technician'; end if;

    if p_expected_updated_at is not null and v_updated_at is distinct from p_expected_updated_at
      then raise exception 'CONFLICT_ERROR: Job changed since it was loaded'; end if;

    if v_next = 'en_route' then
      if v_current_status not in ('scheduled','assigned')
        then raise exception 'INVALID_TRANSITION: Cannot go en route from current work-order status'; end if;
      if v_dispatch_status <> 'assigned'
        then raise exception 'INVALID_TRANSITION: En route requires an assigned job (current dispatch status: %)', v_dispatch_status; end if;
      v_metadata := jsonb_set(v_metadata,'{dispatch_status}',to_jsonb('en_route'::text),true);
      v_metadata := jsonb_set(v_metadata,'{en_route_at}',to_jsonb(v_now_iso),true);
      if p_lat is not null and p_lng is not null then
        v_metadata := jsonb_set(v_metadata,'{en_route_lat}',to_jsonb(p_lat),true);
        v_metadata := jsonb_set(v_metadata,'{en_route_lng}',to_jsonb(p_lng),true);
      end if;
      update public.work_orders set metadata=v_metadata, updated_at=now() where id=p_job_id;
      v_event_type:='en_route';
    elsif v_next = 'arrived' then
      if v_dispatch_status <> 'en_route'
        then raise exception 'INVALID_TRANSITION: Arrival requires the job to be en route first'; end if;
      v_metadata := jsonb_set(v_metadata,'{dispatch_status}',to_jsonb('arrived'::text),true);
      v_metadata := jsonb_set(v_metadata,'{arrived_at}',to_jsonb(v_now_iso),true);
      if p_lat is not null and p_lng is not null then
        v_metadata := jsonb_set(v_metadata,'{arrived_lat}',to_jsonb(p_lat),true);
        v_metadata := jsonb_set(v_metadata,'{arrived_lng}',to_jsonb(p_lng),true);
      end if;
      v_en_route_at := nullif(v_metadata->>'en_route_at','')::timestamptz;
      if v_en_route_at is not null then
        v_metadata := jsonb_set(v_metadata,'{travel_duration_seconds}',
          to_jsonb(greatest(0, extract(epoch from (now() - v_en_route_at))::integer)),true);
      end if;
      if (v_metadata->>'en_route_lat') is not null and (v_metadata->>'en_route_lng') is not null
         and p_lat is not null and p_lng is not null then
        v_distance_miles := 3958.8 * acos(
          least(1.0, greatest(-1.0,
            cos(radians((v_metadata->>'en_route_lat')::double precision)) * cos(radians(p_lat)) *
            cos(radians(p_lng) - radians((v_metadata->>'en_route_lng')::double precision)) +
            sin(radians((v_metadata->>'en_route_lat')::double precision)) * sin(radians(p_lat))
          ))
        );
        v_metadata := jsonb_set(v_metadata,'{travel_distance_miles}',to_jsonb(round(v_distance_miles::numeric, 2)),true);
        v_metadata := jsonb_set(v_metadata,'{travel_distance_captured}',to_jsonb(true),true);
      else
        v_metadata := (v_metadata - 'travel_distance_miles');
        v_metadata := jsonb_set(v_metadata,'{travel_distance_captured}',to_jsonb(false),true);
      end if;
      update public.work_orders set metadata=v_metadata, updated_at=now() where id=p_job_id;
      v_event_type:='arrived';
    elsif v_next in ('in_progress','started') then
      if v_current_status not in ('scheduled','assigned','in_progress')
        then raise exception 'INVALID_TRANSITION: Cannot start work order from current status'; end if;
      if v_dispatch_status = 'en_route'
        then raise exception 'INVALID_TRANSITION: Tap Arrived before beginning work'; end if;
      if v_dispatch_status not in ('assigned','arrived','started')
        then raise exception 'INVALID_TRANSITION: Cannot start work from dispatch status %', v_dispatch_status; end if;
      update public.work_orders set status='in_progress'::public.work_order_status,
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('started'::text),true),updated_at=now()
      where id=p_job_id;
      v_event_type:='started'; v_next:='in_progress';
    elsif v_next in ('completed','complete') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress work order can be completed'; end if;
      update public.work_orders set status='completed'::public.work_order_status,completed_at=coalesce(completed_at,now()),
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('completed'::text),true),updated_at=now()
      where id=p_job_id;
      v_event_type:='completed'; v_next:='completed';
    else
      raise exception 'INVALID_TRANSITION: Unsupported work-order transition';
    end if;

    insert into public.dispatch_events(workspace_id,work_order_id,technician_id,event_type,previous_status,new_status,notes,performed_by)
    values(v_workspace_id,p_job_id,coalesce(v_assigned_user_id,v_actor),v_event_type,v_current_status,v_next,p_notes,v_actor);

    insert into public.work_order_events(workspace_id,work_order_id,actor_user_id,event_type,from_status,to_status,payload)
    values(v_workspace_id,p_job_id,v_actor,'technician_transition',
      v_current_status::public.work_order_status,
      (select status from public.work_orders where id=p_job_id),
      jsonb_build_object('dispatch_status',v_next,'notes',p_notes));
  end if;

  select updated_at into v_updated_at from (
    select a.updated_at from public.appointments a where v_source='appointment' and a.id=p_job_id
    union all
    select wo.updated_at from public.work_orders wo where v_source='work_order' and wo.id=p_job_id
  ) x limit 1;

  v_result:=jsonb_build_object('replayed',false,'job_id',p_job_id,'source',v_source,'status',v_next,'updated_at',v_updated_at);

  insert into public.technician_job_transition_idempotency(actor_user_id,idempotency_key,workspace_id,job_source,job_id,next_status,result)
  values(v_actor,p_idempotency_key,v_workspace_id,v_source,p_job_id,v_next,v_result);

  return v_result;
end;
$$;

revoke all on function public.technician_transition_job_v2(uuid,text,text,text,text,timestamptz,double precision,double precision) from public;
grant execute on function public.technician_transition_job_v2(uuid,text,text,text,text,timestamptz,double precision,double precision) to authenticated;

-- ---------------------------------------------------------------------
-- 2. components — the "what's included" sibling of steps
-- ---------------------------------------------------------------------

alter table public.service_playbooks
  add column if not exists components jsonb not null default '[]'::jsonb;

alter table public.service_playbook_templates
  add column if not exists components jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 3. templates become staff-readable (writes stay service-role only)
-- ---------------------------------------------------------------------

drop policy if exists service_playbook_templates_staff_select on public.service_playbook_templates;
create policy service_playbook_templates_staff_select
  on public.service_playbook_templates for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 4. Seed: Oil Change Service — components + SOP steps
-- ---------------------------------------------------------------------

insert into public.service_playbook_templates (name, description, service_category, steps, components, is_active, sort_order)
select
  'Oil Change Service',
  'Standard full-service oil change: what it includes and the procedure, in order.',
  'oil_change',
  '[
    {"key":"drain_oil","label":"Drain the old engine oil"},
    {"key":"replace_filter","label":"Replace the oil filter"},
    {"key":"refit_drain_plug","label":"Refit the drain plug with a new gasket and torque to spec"},
    {"key":"refill_oil","label":"Refill with the specified oil and quantity"},
    {"key":"run_and_check_leaks","label":"Run the engine and check for leaks"},
    {"key":"check_oil_level","label":"Check the oil level and top off"},
    {"key":"reset_service_reminder","label":"Reset the service reminder"}
  ]'::jsonb,
  '[
    "Engine oil change",
    "Oil filter replacement",
    "Drain plug gasket replacement",
    "Fluid level check"
  ]'::jsonb,
  true,
  10
where not exists (
  select 1 from public.service_playbook_templates
  where name = 'Oil Change Service' and service_category = 'oil_change'
);
