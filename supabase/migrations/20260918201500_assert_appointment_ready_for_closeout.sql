-- Harden appointment completion so every required vehicle inspection and all recommendation work
-- are terminal before closeout. Trigger remains the authoritative DB boundary.
create or replace function public.assert_appointment_ready_for_closeout_v1(
  p_workspace_id uuid,p_appointment_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare v_pending_inspections integer:=0; v_pending_recommendations integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if not exists(select 1 from public.appointments where workspace_id=p_workspace_id and id=p_appointment_id) then raise exception 'Appointment not found'; end if;

  select count(*) into v_pending_inspections from (
    select distinct sc.inspection_template_id template_id,
      coalesce(nullif(ai.metadata->>'vehicle_id','')::uuid,a.vehicle_id) vehicle_id
    from public.appointments a
    join public.appointment_items ai on ai.workspace_id=a.workspace_id and ai.appointment_id=a.id
    join public.service_catalog sc on sc.workspace_id=ai.workspace_id and sc.id=ai.service_catalog_id
    where a.workspace_id=p_workspace_id and a.id=p_appointment_id and sc.inspection_template_id is not null
  ) required
  where not exists(
    select 1 from public.service_inspections si
    where si.workspace_id=p_workspace_id and si.appointment_id=p_appointment_id
      and si.template_id=required.template_id and si.vehicle_id is not distinct from required.vehicle_id
      and si.status='completed'
  );
  if v_pending_inspections>0 then
    raise exception 'INSPECTION_REQUIRED: % required vehicle inspection(s) remain incomplete',v_pending_inspections;
  end if;

  select count(*) into v_pending_recommendations from public.service_recommendations r
   where r.workspace_id=p_workspace_id and r.appointment_id=p_appointment_id and r.status in ('pending','approved');
  if v_pending_recommendations>0 then
    raise exception 'RECOMMENDATION_REQUIRED: % recommendation(s) remain pending or approved work remains unresolved',v_pending_recommendations;
  end if;
end $$;

revoke all on function public.assert_appointment_ready_for_closeout_v1(uuid,uuid) from public,anon;
grant execute on function public.assert_appointment_ready_for_closeout_v1(uuid,uuid) to authenticated,service_role;
