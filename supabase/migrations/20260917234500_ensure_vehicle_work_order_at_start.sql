create unique index if not exists work_orders_appointment_vehicle_unique on public.work_orders(workspace_id,appointment_id,vehicle_id) where appointment_id is not null and vehicle_id is not null;
create or replace function public.ensure_vehicle_work_order_v1(p_workspace_id uuid,p_appointment_id uuid,p_vehicle_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare a public.appointments; existing uuid; nextnum bigint;
begin
 if not public.is_workspace_writer(p_workspace_id) then raise exception 'forbidden'; end if;
 select * into a from public.appointments where workspace_id=p_workspace_id and id=p_appointment_id;
 if a.id is null or a.customer_id is null then raise exception 'appointment/customer not found'; end if;
 select id into existing from public.work_orders where workspace_id=p_workspace_id and appointment_id=p_appointment_id and vehicle_id=p_vehicle_id;
 if existing is not null then return existing; end if;
 select coalesce(max(number),0)+1 into nextnum from public.work_orders where workspace_id=p_workspace_id;
 insert into public.work_orders(workspace_id,appointment_id,customer_id,vehicle_id,status,number,opened_at,created_by,metadata)
 values(p_workspace_id,p_appointment_id,a.customer_id,p_vehicle_id,'in_progress',nextnum,now(),auth.uid(),jsonb_build_object('source','appointment_start'))
 returning id into existing; return existing;
end $$;
revoke all on function public.ensure_vehicle_work_order_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.ensure_vehicle_work_order_v1(uuid,uuid,uuid) to authenticated;