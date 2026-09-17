alter table public.service_recommendations add column if not exists appointment_item_id uuid references public.appointment_items(id) on delete set null;
create or replace function public.decide_service_recommendation_v1(p_recommendation_id uuid,p_decision text)
returns public.service_recommendations language plpgsql security invoker set search_path=public as $$
declare r public.service_recommendations; item_id uuid; next_sort int;
begin
 if p_decision not in ('approved','declined') then raise exception 'invalid decision'; end if;
 select * into r from public.service_recommendations where id=p_recommendation_id for update;
 if r.id is null then raise exception 'recommendation not found'; end if;
 if not public.is_workspace_writer(r.workspace_id) then raise exception 'forbidden'; end if;
 if r.status not in ('pending',p_decision) then raise exception 'recommendation already resolved'; end if;
 if p_decision='approved' and r.appointment_item_id is null then
  select coalesce(max(sort_order),-1)+1 into next_sort from public.appointment_items where workspace_id=r.workspace_id and appointment_id=r.appointment_id;
  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,item_type,description,quantity,unit_price,added_at_service,sort_order,metadata)
  values(r.workspace_id,r.appointment_id,r.service_catalog_id,'service',r.description,1,coalesce(r.price,0),true,next_sort,jsonb_build_object('vehicle_id',r.vehicle_id,'source','inspection_recommendation','recommendation_id',r.id,'inspection_id',r.inspection_id))
  returning id into item_id;
 end if;
 update public.service_recommendations set status=p_decision,decided_at=now(),decided_by=auth.uid(),appointment_item_id=coalesce(appointment_item_id,item_id),updated_at=now() where id=r.id returning * into r; return r;
end $$;
revoke all on function public.decide_service_recommendation_v1(uuid,text) from public,anon;
grant execute on function public.decide_service_recommendation_v1(uuid,text) to authenticated;