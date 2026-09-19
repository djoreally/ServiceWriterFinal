-- Canonical lifecycle for approved additional work.
-- Approval creates the appointment item; only workspace writers may resolve the performed work.
create or replace function public.resolve_service_recommendation_work_v1(
  p_recommendation_id uuid,
  p_resolution text,
  p_notes text default null
) returns public.service_recommendations
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.service_recommendations;
  ai public.appointment_items;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_resolution not in ('completed','unable_to_complete') then raise exception 'invalid work resolution'; end if;

  select * into r from public.service_recommendations where id=p_recommendation_id for update;
  if r.id is null then raise exception 'recommendation not found'; end if;
  if not public.is_workspace_writer(r.workspace_id) then raise exception 'Workspace writer access required'; end if;

  if r.status=p_resolution then return r; end if;
  if r.status<>'approved' or r.appointment_item_id is null then
    raise exception 'Only approved additional work can be resolved';
  end if;

  select * into ai from public.appointment_items
   where id=r.appointment_item_id
     and workspace_id=r.workspace_id
     and appointment_id=r.appointment_id
   for update;
  if ai.id is null
     or ai.added_at_service is not true
     or ai.metadata->>'vehicle_id' is distinct from r.vehicle_id::text
     or ai.metadata->>'recommendation_id' is distinct from r.id::text
     or ai.metadata->>'inspection_id' is distinct from r.inspection_id::text
  then raise exception 'Approved work appointment item attribution is invalid'; end if;

  update public.appointment_items
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
       'work_resolution',p_resolution,
       'work_resolved_at',now(),
       'work_resolved_by',auth.uid(),
       'unable_to_complete_reason',case when p_resolution='unable_to_complete' then nullif(trim(p_notes),'') else null end
     )),
     updated_at=now()
   where id=ai.id;

  update public.service_recommendations
     set status=p_resolution,
         technician_notes=case
           when nullif(trim(p_notes),'') is null then technician_notes
           when nullif(trim(technician_notes),'') is null then trim(p_notes)
           else technician_notes||E'\n'||trim(p_notes)
         end,
         updated_at=now()
   where id=r.id
   returning * into r;
  return r;
end $$;

revoke all on function public.resolve_service_recommendation_work_v1(uuid,text,text) from public,anon;
grant execute on function public.resolve_service_recommendation_work_v1(uuid,text,text) to authenticated,service_role;
