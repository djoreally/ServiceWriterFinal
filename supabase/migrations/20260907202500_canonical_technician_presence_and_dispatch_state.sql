create table if not exists public.technician_presence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'offline' check (status in ('available','en_route','on_job','on_break','unavailable','offline')),
  current_location jsonb,
  current_appointment_id uuid references public.appointments(id) on delete set null,
  clocked_in_at timestamptz,
  break_started_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

alter table public.technician_presence enable row level security;

drop policy if exists technician_presence_select on public.technician_presence;
create policy technician_presence_select on public.technician_presence
for select to authenticated using (public.is_workspace_staff(workspace_id));

drop policy if exists technician_presence_self_insert on public.technician_presence;
create policy technician_presence_self_insert on public.technician_presence
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = technician_presence.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role::text = any(array['owner','admin','manager','service_advisor','dispatcher','technician'])
  )
);

drop policy if exists technician_presence_self_update on public.technician_presence;
create policy technician_presence_self_update on public.technician_presence
for update to authenticated
using (user_id = auth.uid() or public.is_workspace_writer(workspace_id))
with check (user_id = auth.uid() or public.is_workspace_writer(workspace_id));

create or replace function public.set_technician_presence_v1(
  p_workspace_id uuid,
  p_status text,
  p_appointment_id uuid default null,
  p_location jsonb default null
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_assigned uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_status not in ('available','en_route','on_job','on_break','unavailable','offline') then raise exception 'invalid_technician_status'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=v_user and wm.is_active
      and wm.role::text = any(array['owner','admin','manager','service_advisor','dispatcher','technician'])
  ) then raise exception 'technician_presence_access_denied'; end if;
  if p_appointment_id is not null then
    select a.assigned_user_id into v_assigned from public.appointments a where a.workspace_id=p_workspace_id and a.id=p_appointment_id;
    if not found then raise exception 'appointment_not_found'; end if;
    if exists (select 1 from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=v_user and wm.role::text='technician' and wm.is_active)
       and v_assigned is distinct from v_user then raise exception 'appointment_not_assigned_to_technician'; end if;
  end if;
  insert into public.technician_presence(workspace_id,user_id,status,current_location,current_appointment_id,last_seen_at,updated_at)
  values(p_workspace_id,v_user,p_status,p_location,p_appointment_id,now(),now())
  on conflict(workspace_id,user_id) do update
    set status=excluded.status,
        current_location=coalesce(excluded.current_location,technician_presence.current_location),
        current_appointment_id=excluded.current_appointment_id,
        last_seen_at=now(),updated_at=now();
  return jsonb_build_object('workspace_id',p_workspace_id,'user_id',v_user,'status',p_status,'appointment_id',p_appointment_id,'location',p_location);
end;
$$;

create or replace function public.clock_technician_v1(
  p_workspace_id uuid,
  p_action text,
  p_location jsonb default null
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_clocked timestamptz;
  v_break timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=v_user and wm.is_active
      and wm.role::text = any(array['owner','manager','technician'])
  ) then raise exception 'technician_clock_access_denied'; end if;
  if p_action='clock_in' then v_status:='available';
  elsif p_action='clock_out' then v_status:='offline';
  elsif p_action='start_break' then v_status:='on_break';
  elsif p_action='end_break' then v_status:='available';
  else raise exception 'invalid_clock_action'; end if;
  insert into public.technician_presence(workspace_id,user_id,status,current_location,clocked_in_at,break_started_at,last_seen_at,updated_at)
  values(p_workspace_id,v_user,v_status,p_location,
    case when p_action='clock_in' then now() else null end,
    case when p_action='start_break' then now() else null end,now(),now())
  on conflict(workspace_id,user_id) do update
  set status=v_status,
      current_location=coalesce(p_location,technician_presence.current_location),
      clocked_in_at=case when p_action='clock_in' then now() when p_action='clock_out' then null else technician_presence.clocked_in_at end,
      break_started_at=case when p_action='start_break' then now() when p_action in ('end_break','clock_out') then null else technician_presence.break_started_at end,
      current_appointment_id=case when p_action='clock_out' then null else technician_presence.current_appointment_id end,
      last_seen_at=now(),updated_at=now();
  select status,clocked_in_at,break_started_at into v_status,v_clocked,v_break from public.technician_presence where workspace_id=p_workspace_id and user_id=v_user;
  return jsonb_build_object('workspace_id',p_workspace_id,'user_id',v_user,'status',v_status,'clocked_in_at',v_clocked,'break_started_at',v_break);
end;
$$;

revoke all on function public.set_technician_presence_v1(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.set_technician_presence_v1(uuid,text,uuid,jsonb) to authenticated,service_role;
revoke all on function public.clock_technician_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.clock_technician_v1(uuid,text,jsonb) to authenticated,service_role;
