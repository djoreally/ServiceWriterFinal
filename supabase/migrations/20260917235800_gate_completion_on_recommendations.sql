create or replace function public.enforce_appointment_recommendation_resolution_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='completed' and old.status is distinct from new.status and exists(select 1 from public.service_recommendations r where r.workspace_id=new.workspace_id and r.appointment_id=new.id and r.status in ('pending','approved')) then raise exception 'Appointment cannot complete while recommendations are pending or approved work remains unresolved'; end if; return new;
end $$;
drop trigger if exists enforce_appointment_recommendation_resolution on public.appointments;
create trigger enforce_appointment_recommendation_resolution before update of status on public.appointments for each row execute function public.enforce_appointment_recommendation_resolution_v1();
revoke all on function public.enforce_appointment_recommendation_resolution_v1() from public,anon,authenticated;