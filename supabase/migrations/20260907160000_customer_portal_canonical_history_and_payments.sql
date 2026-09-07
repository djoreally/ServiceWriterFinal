begin;

create or replace function public.link_customer_portal_account_v1()
returns table(customer_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if v_email='' then raise exception 'Authenticated email is required' using errcode='22023'; end if;
  return query
  with candidates as (
    select c.id as candidate_customer_id,c.workspace_id as candidate_workspace_id from public.customers c where lower(coalesce(c.email::text,''))=v_email
    union
    select a.customer_id as candidate_customer_id,a.workspace_id as candidate_workspace_id from public.appointments a where a.customer_id is not null and lower(coalesce(a.metadata->>'guest_email',''))=v_email
  ), inserted as (
    insert into public.customer_users(customer_id,user_id,workspace_id,is_primary,created_at,updated_at)
    select distinct c.candidate_customer_id,v_user_id,c.candidate_workspace_id,false,now(),now() from candidates c
    on conflict on constraint customer_users_pkey do update set workspace_id=excluded.workspace_id,updated_at=now()
    returning customer_users.customer_id as linked_customer_id,customer_users.workspace_id as linked_workspace_id
  )
  select inserted.linked_customer_id,inserted.linked_workspace_id from inserted;
end;
$function$;

create or replace function public.get_customer_portal_service_history_v1()
returns table(id uuid,title text,scheduled_date date,scheduled_time time without time zone,status text,estimated_cost numeric,duration_minutes integer,description text,notes text,tax_amount numeric,actual_start_time timestamptz,actual_end_time timestamptz,service_catalog_name text,vehicle_make text,vehicle_model text,vehicle_year integer)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  perform 1 from public.link_customer_portal_account_v1();
  return query
  select sr.id,
    coalesce(nullif(a.metadata->>'title',''),nullif(ai.description,''),nullif(sr.work_performed,''),'Service'),
    (coalesce(a.starts_at,sr.completed_at,sr.created_at) at time zone coalesce(w.timezone,'UTC'))::date,
    (coalesce(a.starts_at,sr.completed_at,sr.created_at) at time zone coalesce(w.timezone,'UTC'))::time,
    sr.status,
    coalesce(sr.total_amount,nullif(a.metadata->>'estimated_cost','')::numeric,0),
    case when a.starts_at is not null and a.ends_at is not null then greatest(0,round(extract(epoch from(a.ends_at-a.starts_at))/60.0)::integer) else 0 end,
    coalesce(nullif(a.metadata->>'description',''),sr.work_performed,sr.diagnosis),
    coalesce(sr.customer_notes,a.notes),
    coalesce(sr.tax_amount,nullif(a.metadata->>'tax_amount','')::numeric,0),
    sr.started_at,sr.completed_at,sc.name,v.make,v.model,v.year::integer
  from public.service_records sr
  join public.workspaces w on w.id=sr.workspace_id
  left join public.appointments a on a.id=sr.appointment_id and a.workspace_id=sr.workspace_id
  left join lateral(select i.description,i.service_catalog_id from public.appointment_items i where i.appointment_id=a.id and i.workspace_id=a.workspace_id order by i.sort_order,i.created_at limit 1) ai on true
  left join public.service_catalog sc on sc.id=ai.service_catalog_id and sc.workspace_id=sr.workspace_id
  left join public.vehicles v on v.id=coalesce(sr.vehicle_id,a.vehicle_id) and v.workspace_id=sr.workspace_id
  where sr.customer_id is not null and exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=sr.customer_id and cu.workspace_id=sr.workspace_id)
  order by coalesce(sr.completed_at,a.starts_at,sr.created_at) desc;
end;
$function$;

create or replace function public.get_customer_portal_payments_v1()
returns table(id uuid,title text,scheduled_date date,scheduled_time time without time zone,status text,estimated_cost numeric,payment_status text,tax_amount numeric,service_catalog_name text)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  perform 1 from public.link_customer_portal_account_v1();
  return query
  select p.id,
    coalesce(nullif(a.metadata->>'title',''),nullif(ai.description,''),'Payment'),
    (coalesce(a.starts_at,p.paid_at,p.created_at) at time zone coalesce(w.timezone,'UTC'))::date,
    (coalesce(a.starts_at,p.paid_at,p.created_at) at time zone coalesce(w.timezone,'UTC'))::time,
    coalesce(a.status::text,'payment'),
    p.amount,
    case p.status when 'succeeded' then 'paid' when 'partially_refunded' then 'partial' else p.status::text end,
    coalesce((p.metadata->>'tax_amount_cents')::numeric/100.0,0),
    sc.name
  from public.payments p
  join public.workspaces w on w.id=p.workspace_id
  left join public.appointments a on a.id=nullif(p.metadata->>'appointment_id','')::uuid and a.workspace_id=p.workspace_id
  left join lateral(select i.description,i.service_catalog_id from public.appointment_items i where i.appointment_id=a.id and i.workspace_id=a.workspace_id order by i.sort_order,i.created_at limit 1) ai on true
  left join public.service_catalog sc on sc.id=ai.service_catalog_id and sc.workspace_id=p.workspace_id
  where p.customer_id is not null and exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=p.customer_id and cu.workspace_id=p.workspace_id)
  order by coalesce(p.paid_at,p.created_at) desc;
end;
$function$;

revoke all on function public.link_customer_portal_account_v1() from public,anon;
revoke all on function public.get_customer_portal_service_history_v1() from public,anon;
revoke all on function public.get_customer_portal_payments_v1() from public,anon;
grant execute on function public.link_customer_portal_account_v1() to authenticated,service_role;
grant execute on function public.get_customer_portal_service_history_v1() to authenticated,service_role;
grant execute on function public.get_customer_portal_payments_v1() to authenticated,service_role;

commit;
