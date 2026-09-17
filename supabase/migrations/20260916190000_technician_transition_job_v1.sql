-- Canonical atomic technician job transitions.
-- Reconciles the Technician App RPC contract with the production dispatch model.

create table if not exists public.technician_job_transition_idempotency (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_source text not null check (job_source in ('appointment','work_order')),
  job_id uuid not null,
  next_status text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, idempotency_key)
);

create index if not exists technician_job_transition_idempotency_job_idx
  on public.technician_job_transition_idempotency(workspace_id, job_source, job_id, created_at desc);

alter table public.technician_job_transition_idempotency enable row level security;

revoke all on public.technician_job_transition_idempotency from anon, authenticated;

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
  v_result jsonb;
  v_event_type text;
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
    elsif v_next in ('paused','delayed') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress appointment can be paused'; end if;
      update public.appointments set
        metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('paused'::text),true),
        updated_at=now()
      where id=p_job_id;
      v_event_type:='paused'; v_next:='paused';
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

  else
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
    elsif v_next in ('paused','delayed') then
      if v_current_status <> 'in_progress'
        then raise exception 'INVALID_TRANSITION: Only an in-progress work order can be paused'; end if;
      update public.work_orders set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{dispatch_status}',to_jsonb('paused'::text),true),updated_at=now()
      where id=p_job_id;
      v_event_type:='paused'; v_next:='paused';
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

revoke all on function public.technician_transition_job_v1(uuid,text,text,text,text,timestamptz) from public;
grant execute on function public.technician_transition_job_v1(uuid,text,text,text,text,timestamptz) to authenticated;
