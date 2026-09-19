alter table public.service_recommendations add column if not exists appointment_item_id uuid references public.appointment_items(id) on delete set null;

-- Canonical non-fleet authorization path: Appointment is the work order.
-- Keep this definition aligned with production and preserve exact vehicle attribution.
create or replace function public.decide_service_recommendation_v1(p_recommendation_id uuid,p_decision text)
returns public.service_recommendations language plpgsql security definer set search_path=public as $$
declare
 r public.service_recommendations;
 recommendation_appointment public.appointments;
 existing_item public.appointment_items;
 item_id uuid;
 next_sort integer;
begin
 if p_decision not in ('approved','declined') then raise exception 'invalid decision'; end if;
 select * into r from public.service_recommendations where id=p_recommendation_id for update;
 if r.id is null then raise exception 'recommendation not found'; end if;

 select * into recommendation_appointment
 from public.appointments
 where id=r.appointment_id and workspace_id=r.workspace_id
 for update;
 if recommendation_appointment.id is null then raise exception 'appointment not found'; end if;

 if not public.is_workspace_writer(r.workspace_id)
   and not public.is_customer_for_workspace(r.workspace_id,recommendation_appointment.customer_id)
 then raise exception 'forbidden'; end if;

 if r.status not in ('pending',p_decision) then raise exception 'recommendation already resolved'; end if;

 if r.status=p_decision and (p_decision='declined' or r.appointment_item_id is not null) then
  if r.appointment_item_id is not null then
   select * into existing_item from public.appointment_items
   where id=r.appointment_item_id and workspace_id=r.workspace_id and appointment_id=r.appointment_id;
   if existing_item.id is null
      or existing_item.added_at_service is not true
      or existing_item.metadata->>'vehicle_id' is distinct from r.vehicle_id::text
      or existing_item.metadata->>'recommendation_id' is distinct from r.id::text
      or existing_item.metadata->>'inspection_id' is distinct from r.inspection_id::text
   then raise exception 'recommendation appointment item attribution is invalid'; end if;
  end if;
  return r;
 end if;

 if p_decision='approved' then
  perform 1 from public.service_inspections si
  where si.id=r.inspection_id and si.workspace_id=r.workspace_id
    and si.appointment_id=r.appointment_id and si.vehicle_id=r.vehicle_id;
  if not found then raise exception 'recommendation inspection attribution is invalid'; end if;

  if r.inspection_result_id is not null then
   perform 1 from public.inspection_results ir
   where ir.id=r.inspection_result_id and ir.inspection_id=r.inspection_id;
   if not found then raise exception 'recommendation finding attribution is invalid'; end if;
  end if;

  select coalesce(max(sort_order),-1)+1 into next_sort
  from public.appointment_items
  where workspace_id=r.workspace_id and appointment_id=r.appointment_id;

  insert into public.appointment_items(
   workspace_id,appointment_id,service_catalog_id,item_type,description,quantity,
   unit_price,added_at_service,sort_order,metadata
  ) values(
   r.workspace_id,r.appointment_id,r.service_catalog_id,'service',r.description,1,
   coalesce(r.price,0),true,next_sort,
   jsonb_strip_nulls(jsonb_build_object(
    'source','inspection_recommendation',
    'vehicle_id',r.vehicle_id,
    'recommendation_id',r.id,
    'inspection_id',r.inspection_id,
    'inspection_result_id',r.inspection_result_id
   ))
  ) returning id into item_id;
 end if;

 update public.service_recommendations
 set status=p_decision,decided_at=now(),decided_by=auth.uid(),
     appointment_item_id=case when p_decision='approved' then item_id else appointment_item_id end,
     updated_at=now()
 where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.decide_service_recommendation_v1(uuid,text) from public,anon;
grant execute on function public.decide_service_recommendation_v1(uuid,text) to authenticated;
