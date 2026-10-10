-- Fleet bridge repair (forensic audit 2026-10-10, item 1).
--
-- 1. Adds nullable workspace_id to fleet_work_orders, backfilled from the
--    owning user's first active workspace membership where determinable.
-- 2. Repairs technician_transition_job_v1: the tech app sends
--    source='fleet_work_order', which used to map onto public.work_orders
--    (always "Job not found"). It now resolves to public.fleet_work_orders
--    via a dedicated branch with row locking, idempotency, transition
--    validation, and fleet_activity_logs events.
-- Does NOT unify the job tables -- that is a separate migration project.

-- ---------------------------------------------------------------------------
-- (a) workspace_id on fleet_work_orders
-- ---------------------------------------------------------------------------

alter table public.fleet_work_orders
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

update public.fleet_work_orders f
set workspace_id = m.workspace_id
from (
  select distinct on (wm.user_id) wm.user_id, wm.workspace_id
  from public.workspace_members wm
  where wm.is_active
  order by wm.user_id, wm.created_at nulls last
) m
where f.workspace_id is null and f.user_id = m.user_id;

create index if not exists fleet_work_orders_workspace_id_idx
  on public.fleet_work_orders(workspace_id);

-- ---------------------------------------------------------------------------
-- (b) allow 'fleet_work_order' in the transition idempotency log
-- ---------------------------------------------------------------------------

do $$
begin
  alter table public.technician_job_transition_idempotency
    drop constraint if exists technician_job_transition_idempotency_job_source_check;
  alter table public.technician_job_transition_idempotency
    add constraint technician_job_transition_idempotency_job_source_check
    check (job_source in ('appointment','work_order','fleet_work_order'));
exception when undefined_table then
  raise notice 'technician_job_transition_idempotency missing; skipping check update';
end
$$;

-- ---------------------------------------------------------------------------
-- (c) repaired technician_transition_job_v1 (full replacement)
-- ---------------------------------------------------------------------------

create or replace function public.technician_transition_job_v1(
  p_job_id uuid,
  p_source text,
  p_next_status text,
  p_notes text default null,
  p_idempotency_key text default null,
  p_expected_updated_at timestamptz default null
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
  v_fleet_owner uuid;
  v_result jsonb;
  v_event_type text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_job_id is null then raise exception 'Job id required'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotency key required'; end if;

  v_source := case lower(trim(coalesce(p_source,'')))
    when 'appointment' then 'appointment'
    when 'work_order' then 'work_order'
    when 'fleet_work_order' then 'fleet_work_order'
    else null
  end;
  if v_source is null then raise exception 'Unsupported job source'; end if;

  select i.result into v_result
  from public.technician_job_transition_idempotency i
  where i.actor_user_id=v_actor and i.idempotency_key=p_idempotency_key;
  if found then return v_result || jsonb_build_object('replayed',true); end if;

  if v_source='appointment' then
    select a.workspace_id,a.status::text,coalesce(a.metadata->>'dispatch_status','assigned'),a.updated_at,a.assigned_user_id
      into v_workspace_id,v_current_status,v_dispatch_status,v_updated_at,v_assigned_user_id
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

    if v_next in ('en_route','arrived') then
      if v_current_status not in ('requested','confirmed','checked_in','in_progress')
        then raise exception 'INVALID_TRANSITION: Operational transition not allowed from current appointment status'; end if;
      update public.appointments set
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb(v_next),true),
        updated_at=now()
      where id=p_job_id;
      v_event_type:=v_next;
    elsif v_next in ('in_progress','started') then
      if v_current_status not in ('confirmed','checked_in','in_progress')
        then raise exception 'INVALID_TRANSITION: Cannot start appointment from current status'; end if;
      update public.appointments set status='in_progress'::public.appointment_status,
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('started'::text),true),
        updated_at=now()
      where id=p_job_id;
      v_event_type:='started'; v_next:='in_progress';
    elsif v_next in ('completed','complete') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress appointment can be completed'; end if;
      perform public.complete_appointment_closeout_v1(v_workspace_id,p_job_id);
      update public.appointments set
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('completed'::text),true),
        updated_at=now()
      where id=p_job_id;
      v_event_type:='completed'; v_next:='completed';
    else
      raise exception 'INVALID_TRANSITION: Unsupported appointment transition';
    end if;

    insert into public.dispatch_events(workspace_id,appointment_id,technician_id,event_type,previous_status,new_status,notes,performed_by)
    values(v_workspace_id,p_job_id,coalesce(v_assigned_user_id,v_actor),v_event_type,v_current_status,v_next,p_notes,v_actor);

  elsif v_source='work_order' then
    select wo.workspace_id,wo.status::text,coalesce(wo.metadata->>'dispatch_status','assigned'),wo.updated_at
      into v_workspace_id,v_current_status,v_dispatch_status,v_updated_at
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

    if v_next in ('en_route','arrived') then
      if v_current_status not in ('scheduled','assigned','in_progress')
        then raise exception 'INVALID_TRANSITION: Operational transition not allowed from current work-order status'; end if;
      update public.work_orders set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb(v_next),true),updated_at=now()
      where id=p_job_id;
      v_event_type:=v_next;
    elsif v_next in ('in_progress','started') then
      if v_current_status not in ('scheduled','assigned','in_progress')
        then raise exception 'INVALID_TRANSITION: Cannot start work order from current status'; end if;
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

  -- ------------------------------------------------------------------
  -- Fleet bridge: fleet_work_orders is user_id-scoped (not workspace).
  -- workspace_id is backfilled from the owning user's memberships
  -- (see 20261010030000). The tech app sends source='fleet_work_order';
  -- that source MUST resolve here, never to public.work_orders.
  -- ------------------------------------------------------------------
  elsif v_source='fleet_work_order' then
    select f.workspace_id,f.status::text,f.updated_at,f.user_id
      into v_workspace_id,v_current_status,v_updated_at,v_fleet_owner
    from public.fleet_work_orders f where f.id=p_job_id for update;
    if not found then raise exception 'Job not found'; end if;

    if v_workspace_id is null then
      select wm.workspace_id into v_workspace_id
      from public.workspace_members wm
      where wm.user_id=v_fleet_owner and wm.is_active
      order by wm.created_at nulls last limit 1;
    end if;
    if v_workspace_id is null then raise exception 'Job has no workspace scope'; end if;

    if v_actor <> v_fleet_owner and not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id=v_workspace_id and wm.user_id=v_actor and wm.is_active
        and wm.role::text=any(array['technician','owner','admin','manager','service_advisor','dispatcher'])
    ) then raise exception 'Technician transition access denied'; end if;

    if p_expected_updated_at is not null and v_updated_at is distinct from p_expected_updated_at
      then raise exception 'CONFLICT_ERROR: Job changed since it was loaded'; end if;

    if v_next='en_route' then
      if v_current_status not in ('scheduled','assigned')
        then raise exception 'INVALID_TRANSITION: Cannot mark fleet work order en route from current status'; end if;
      update public.fleet_work_orders set status='en_route',en_route_at=coalesce(en_route_at,now()),updated_at=now()
      where id=p_job_id;
      v_event_type:='en_route';
    elsif v_next='arrived' then
      if v_current_status <> 'en_route'
        then raise exception 'INVALID_TRANSITION: Cannot mark fleet work order arrived before en route'; end if;
      update public.fleet_work_orders set status='arrived',arrived_at=coalesce(arrived_at,now()),updated_at=now()
      where id=p_job_id;
      v_event_type:='arrived';
    elsif v_next in ('in_progress','started') then
      if v_current_status not in ('scheduled','assigned','en_route','arrived','in_progress')
        then raise exception 'INVALID_TRANSITION: Cannot start fleet work order from current status'; end if;
      update public.fleet_work_orders set status='in_progress',started_at=coalesce(started_at,now()),updated_at=now()
      where id=p_job_id;
      v_event_type:='started'; v_next:='in_progress';
    elsif v_next in ('completed','complete') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress fleet work order can be completed'; end if;
      update public.fleet_work_orders set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
      where id=p_job_id;
      v_event_type:='completed'; v_next:='completed';
    else
      raise exception 'INVALID_TRANSITION: Unsupported fleet work-order transition';
    end if;

    insert into public.fleet_activity_logs(fleet_work_order_id,user_id,action,actor_role,details)
    values(p_job_id,v_actor,'technician_transition','technician',
      jsonb_build_object('from_status',v_current_status,'to_status',v_next,'dispatch_status',v_event_type,'notes',p_notes));
  end if;

  select updated_at into v_updated_at from (
    select a.updated_at from public.appointments a where v_source='appointment' and a.id=p_job_id
    union all
    select wo.updated_at from public.work_orders wo where v_source='work_order' and wo.id=p_job_id
    union all
    select f.updated_at from public.fleet_work_orders f where v_source='fleet_work_order' and f.id=p_job_id
  ) x limit 1;

  v_result:=jsonb_build_object('replayed',false,'job_id',p_job_id,'source',v_source,'status',v_next,'updated_at',v_updated_at);

  insert into public.technician_job_transition_idempotency(actor_user_id,idempotency_key,workspace_id,job_source,job_id,next_status,result)
  values(v_actor,p_idempotency_key,v_workspace_id,v_source,p_job_id,v_next,v_result);

  return v_result;
end;
$$;


revoke all on function public.technician_transition_job_v1(uuid,text,text,text,text,timestamptz) from public;
grant execute on function public.technician_transition_job_v1(uuid,text,text,text,text,timestamptz) to authenticated;
