begin;

create or replace function public.link_customer_portal_account_v1()
returns table(customer_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email is required' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select c.id as customer_id, c.workspace_id
      from public.customers c
     where lower(coalesce(c.email::text, '')) = v_email
    union
    select a.customer_id, a.workspace_id
      from public.appointments a
     where a.customer_id is not null
       and lower(coalesce(a.metadata ->> 'guest_email', '')) = v_email
  ), inserted as (
    insert into public.customer_users (customer_id, user_id, workspace_id, is_primary, created_at, updated_at)
    select distinct c.customer_id, v_user_id, c.workspace_id, false, now(), now()
      from candidates c
    on conflict (customer_id, user_id) do update
      set workspace_id = excluded.workspace_id,
          updated_at = now()
    returning customer_users.customer_id, customer_users.workspace_id
  )
  select inserted.customer_id, inserted.workspace_id from inserted;
end;
$function$;

create or replace function public.get_customer_portal_appointments_v1()
returns table(
  id uuid,
  title text,
  scheduled_date date,
  scheduled_time time without time zone,
  duration_minutes integer,
  status text,
  estimated_cost numeric,
  guest_name text,
  management_token text,
  location_address text,
  notes text,
  description text,
  payment_status text,
  service_catalog_name text,
  created_at timestamptz,
  assigned_at timestamptz,
  actual_start_time timestamptz,
  actual_end_time timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform 1 from public.link_customer_portal_account_v1();

  return query
  select
    a.id,
    coalesce(nullif(a.metadata ->> 'title', ''), nullif(ai.description, ''), 'Service appointment') as title,
    (a.starts_at at time zone coalesce(w.timezone, 'UTC'))::date as scheduled_date,
    (a.starts_at at time zone coalesce(w.timezone, 'UTC'))::time as scheduled_time,
    greatest(0, round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0)::integer) as duration_minutes,
    a.status::text,
    nullif(a.metadata ->> 'estimated_cost', '')::numeric as estimated_cost,
    coalesce(
      nullif(a.metadata ->> 'guest_name', ''),
      nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
      v_email
    ) as guest_name,
    nullif(a.metadata ->> 'management_token', '') as management_token,
    coalesce(nullif(a.metadata ->> 'location_address', ''), nullif(a.metadata ->> 'service_address', '')) as location_address,
    a.notes,
    nullif(a.metadata ->> 'description', '') as description,
    nullif(a.metadata ->> 'payment_status', '') as payment_status,
    sc.name as service_catalog_name,
    a.created_at,
    null::timestamptz as assigned_at,
    null::timestamptz as actual_start_time,
    null::timestamptz as actual_end_time
  from public.appointments a
  join public.workspaces w on w.id = a.workspace_id
  left join public.customers c on c.id = a.customer_id and c.workspace_id = a.workspace_id
  left join lateral (
    select i.description, i.service_catalog_id
      from public.appointment_items i
     where i.appointment_id = a.id and i.workspace_id = a.workspace_id
     order by i.sort_order, i.created_at
     limit 1
  ) ai on true
  left join public.service_catalog sc on sc.id = ai.service_catalog_id and sc.workspace_id = a.workspace_id
  where exists (
          select 1 from public.customer_users cu
           where cu.user_id = v_user_id
             and cu.customer_id = a.customer_id
             and cu.workspace_id = a.workspace_id
        )
     or lower(coalesce(a.metadata ->> 'guest_email', '')) = v_email
  order by a.starts_at desc;
end;
$function$;

revoke all on function public.link_customer_portal_account_v1() from public, anon;
revoke all on function public.get_customer_portal_appointments_v1() from public, anon;
grant execute on function public.link_customer_portal_account_v1() to authenticated, service_role;
grant execute on function public.get_customer_portal_appointments_v1() to authenticated, service_role;

commit;
