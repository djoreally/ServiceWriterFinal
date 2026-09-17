-- Enforce required inspections at the database boundary and scope completion by vehicle + template.

drop index if exists public.service_inspections_one_completed_template_per_appointment_idx;
create unique index if not exists service_inspections_one_completed_template_per_vehicle_idx
  on public.service_inspections(
    workspace_id,
    appointment_id,
    template_id,
    coalesce(vehicle_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status='completed' and appointment_id is not null;

create or replace function public.enforce_appointment_inspection_completion_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_pending integer;
begin
  if new.status::text <> 'completed' or old.status::text = 'completed' then
    return new;
  end if;

  select count(*) into v_pending
  from (
    select distinct
      sc.inspection_template_id as template_id,
      case
        when nullif(ai.metadata->>'vehicle_id','') is null then a.vehicle_id
        else (ai.metadata->>'vehicle_id')::uuid
      end as vehicle_id
    from public.appointment_items ai
    join public.service_catalog sc
      on sc.id=ai.service_catalog_id and sc.workspace_id=ai.workspace_id
    join public.appointments a
      on a.id=ai.appointment_id and a.workspace_id=ai.workspace_id
    where ai.workspace_id=new.workspace_id
      and ai.appointment_id=new.id
      and sc.inspection_template_id is not null
  ) required
  where not exists (
    select 1
    from public.service_inspections si
    where si.workspace_id=new.workspace_id
      and si.appointment_id=new.id
      and si.template_id=required.template_id
      and si.status='completed'
      and si.vehicle_id is not distinct from required.vehicle_id
  );

  if v_pending > 0 then
    raise exception 'INSPECTION_REQUIRED: % required vehicle inspection(s) remain incomplete', v_pending;
  end if;
  return new;
end $$;

revoke all on function public.enforce_appointment_inspection_completion_v1() from public,anon,authenticated;

drop trigger if exists trg_enforce_appointment_inspection_completion_v1 on public.appointments;
create trigger trg_enforce_appointment_inspection_completion_v1
before update of status on public.appointments
for each row execute function public.enforce_appointment_inspection_completion_v1();
