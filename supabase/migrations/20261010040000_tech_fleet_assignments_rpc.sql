-- Tech fleet assignments read (forensic audit 2026-10-10, Phase 4 item 3).
--
-- The tech app's Fleet tab calls GET /v1/tech-app/fleet-assignments, which
-- reads public.fleet_work_orders directly. RLS on that table is owner-only
-- (user_id = auth.uid()), so an assigned technician (a different auth user)
-- always gets zero rows -- fleet jobs are invisible in the tech app even
-- after a successful dispatch. This SECURITY DEFINER function returns the
-- non-terminal fleet work orders assigned to one technician, with the same
-- nested shape the client already maps (fleet_jobs / fleet_clients /
-- fleet_locations / fleet_vehicles). The caller must be the technician
-- themselves or an ops-role member of the technician's workspace.

create or replace function public.get_tech_fleet_assignments_v1(p_technician_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tech_id uuid := p_technician_id;
  v_tech_auth uuid;
  v_tech_user uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  if v_tech_id is null then
    select t.id into v_tech_id
    from public.technicians t
    where t.auth_user_id = v_actor
      and coalesce(t.is_active, true)
      and t.deleted_at is null
    order by t.created_at nulls last
    limit 1;
  end if;

  if v_tech_id is null then
    return '[]'::jsonb;
  end if;

  select t.auth_user_id, t.user_id into v_tech_auth, v_tech_user
  from public.technicians t
  where t.id = v_tech_id;
  if not found then
    return '[]'::jsonb;
  end if;

  -- The caller must be the technician themselves, or hold an ops role in a
  -- workspace the technician belongs to. (Resolved through workspace_members
  -- on the technician's linked auth identity -- no dependency on a
  -- technicians.workspace_id column.)
  if v_actor <> coalesce(v_tech_auth, '00000000-0000-0000-0000-000000000000')
     and v_actor <> coalesce(v_tech_user, '00000000-0000-0000-0000-000000000000')
     and not exists (
    select 1
    from public.workspace_members wm
    join public.workspace_members tm on tm.workspace_id = wm.workspace_id
    where wm.user_id = v_actor
      and wm.is_active
      and wm.role::text = any (array['owner','admin','manager','service_advisor','dispatcher'])
      and tm.user_id in (v_tech_auth, v_tech_user)
      and tm.is_active
  ) then
    raise exception 'Technician assignment access denied';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.scheduled_date nulls last, x.scheduled_time nulls last)
    from (
      select
        f.id,
        f.order_number,
        f.scheduled_date,
        f.scheduled_time,
        f.status,
        f.priority,
        f.service_type,
        f.description,
        f.total,
        f.fleet_job_id,
        f.assigned_technician_id,
        case when j.id is null then null else jsonb_build_object('job_number', j.job_number) end as fleet_jobs,
        case when c.id is null then null else jsonb_build_object('company_name', c.company_name) end as fleet_clients,
        case when l.id is null then null else jsonb_build_object('name', l.name, 'address', l.address) end as fleet_locations,
        case when v.id is null then null else jsonb_build_object(
          'year', v.year, 'make', v.make, 'model', v.model,
          'unit_number', v.unit_number, 'license_plate', v.license_plate
        ) end as fleet_vehicles
      from public.fleet_work_orders f
      left join public.fleet_jobs j on j.id = f.fleet_job_id
      left join public.fleet_clients c on c.id = f.fleet_client_id
      left join public.fleet_locations l on l.id = f.fleet_location_id
      left join public.fleet_vehicles v on v.id = f.fleet_vehicle_id
      where f.assigned_technician_id = v_tech_id
        and f.status not in ('completed','cancelled','invoiced')
      order by f.scheduled_date nulls last, f.scheduled_time nulls last
      limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_tech_fleet_assignments_v1(uuid) from public;
grant execute on function public.get_tech_fleet_assignments_v1(uuid) to authenticated;
