-- Vehicle-scoped inspection recommendation bridge.
-- Non-fleet invariant: the appointment is the work order. Approved recommendations
-- are materialized into appointment_items by a later migration; this migration must
-- never create or require fleet work_orders/work_order_items.
create table if not exists public.service_recommendations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 vehicle_id uuid not null,
 inspection_id uuid not null references public.service_inspections(id) on delete cascade,
 inspection_result_id uuid references public.inspection_results(id) on delete set null,
 service_catalog_id uuid references public.service_catalog(id) on delete set null,
 description text not null,
 technician_notes text,
 price numeric(12,2),
 status text not null default 'pending' check(status in ('pending','approved','declined','completed','unable_to_complete')),
 decided_at timestamptz,
 decided_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,inspection_result_id,service_catalog_id)
);
alter table public.service_recommendations enable row level security;
drop policy if exists service_recommendations_staff_select on public.service_recommendations;
create policy service_recommendations_staff_select on public.service_recommendations for select to authenticated using(public.is_workspace_staff(workspace_id));
drop policy if exists service_recommendations_staff_insert on public.service_recommendations;
create policy service_recommendations_staff_insert on public.service_recommendations for insert to authenticated with check(public.is_workspace_writer(workspace_id));
drop policy if exists service_recommendations_staff_update on public.service_recommendations;
create policy service_recommendations_staff_update on public.service_recommendations for update to authenticated using(public.is_workspace_writer(workspace_id)) with check(public.is_workspace_writer(workspace_id));
create index if not exists service_recommendations_appt_vehicle_idx on public.service_recommendations(workspace_id,appointment_id,vehicle_id,status);

create or replace function public.decide_service_recommendation_v1(p_recommendation_id uuid,p_decision text)
returns public.service_recommendations language plpgsql security invoker set search_path=public as $$
declare r public.service_recommendations;
begin
 if p_decision not in ('approved','declined') then raise exception 'invalid decision'; end if;
 select * into r from public.service_recommendations where id=p_recommendation_id for update;
 if r.id is null then raise exception 'recommendation not found'; end if;
 if not public.is_workspace_writer(r.workspace_id) then raise exception 'forbidden'; end if;
 if r.status not in ('pending',p_decision) then raise exception 'recommendation already resolved'; end if;
 update public.service_recommendations
 set status=p_decision,decided_at=now(),decided_by=auth.uid(),updated_at=now()
 where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.decide_service_recommendation_v1(uuid,text) from public,anon;
grant execute on function public.decide_service_recommendation_v1(uuid,text) to authenticated;
