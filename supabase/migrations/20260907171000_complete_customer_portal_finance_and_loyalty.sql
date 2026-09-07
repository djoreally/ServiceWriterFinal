-- Customer portal: canonical payment/invoice links and CRM loyalty visibility.

drop function if exists public.get_customer_portal_payments_v1();

create function public.get_customer_portal_payments_v1()
returns table(
  id uuid,
  title text,
  scheduled_date date,
  scheduled_time time without time zone,
  status text,
  estimated_cost numeric,
  payment_status text,
  tax_amount numeric,
  service_catalog_name text,
  invoice_id uuid,
  invoice_number bigint,
  invoice_status text,
  payment_url text,
  receipt_url text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  perform 1 from public.link_customer_portal_account_v1();
  return query
  select
    p.id,
    coalesce(nullif(a.metadata->>'title',''),nullif(ai.description,''),'Payment'),
    (coalesce(a.starts_at,p.paid_at,p.created_at) at time zone coalesce(w.timezone,'UTC'))::date,
    (coalesce(a.starts_at,p.paid_at,p.created_at) at time zone coalesce(w.timezone,'UTC'))::time,
    coalesce(a.status::text,'payment'),
    p.amount,
    case p.status when 'succeeded' then 'paid' when 'partially_refunded' then 'partial' else p.status::text end,
    coalesce(nullif(p.metadata->>'tax_amount_cents','')::numeric/100.0,0),
    sc.name,
    i.id,
    i.invoice_number,
    i.status::text,
    case when p.status <> 'succeeded' then coalesce(nullif(p.metadata->>'payment_url',''),nullif(i.metadata->>'stripe_hosted_invoice_url','')) else null end,
    case when p.status = 'succeeded' then coalesce(nullif(i.metadata->>'stripe_hosted_invoice_url',''),nullif(p.metadata->>'payment_url','')) else null end
  from public.payments p
  join public.workspaces w on w.id=p.workspace_id
  left join public.invoices i on i.id=p.invoice_id and i.workspace_id=p.workspace_id
  left join public.appointments a on a.id=nullif(p.metadata->>'appointment_id','')::uuid and a.workspace_id=p.workspace_id
  left join lateral (
    select appt_item.description,appt_item.service_catalog_id
    from public.appointment_items appt_item
    where appt_item.appointment_id=a.id and appt_item.workspace_id=a.workspace_id
    order by appt_item.sort_order,appt_item.created_at limit 1
  ) ai on true
  left join public.service_catalog sc on sc.id=ai.service_catalog_id and sc.workspace_id=p.workspace_id
  where p.customer_id is not null
    and exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=p.customer_id and cu.workspace_id=p.workspace_id)
  order by coalesce(p.paid_at,p.created_at) desc;
end;
$$;

revoke all on function public.get_customer_portal_payments_v1() from public, anon;
grant execute on function public.get_customer_portal_payments_v1() to authenticated, service_role;

create or replace function public.get_customer_portal_rewards_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_completed integer := 0;
  v_spent numeric := 0;
  v_points integer := 0;
  v_accounts jsonb := '[]'::jsonb;
  v_ledger jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  perform 1 from public.link_customer_portal_account_v1();

  select count(*)::integer,coalesce(sum(sr.total_amount),0)
    into v_completed,v_spent
    from public.service_records sr
   where sr.status='completed'
     and exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=sr.customer_id and cu.workspace_id=sr.workspace_id);

  select coalesce(sum(la.current_points),0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id',la.id,'workspace_id',la.workspace_id,'customer_id',la.customer_id,'current_points',la.current_points,'enrolled_at',la.enrolled_at,'updated_at',la.updated_at) order by la.updated_at desc),'[]'::jsonb)
    into v_points,v_accounts
    from public.crm_loyalty_accounts la
   where exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=la.customer_id and cu.workspace_id=la.workspace_id);

  select coalesce(jsonb_agg(x.row_json order by x.created_at desc),'[]'::jsonb)
    into v_ledger
    from (
      select jsonb_build_object('id',ll.id,'account_id',ll.loyalty_account_id,'workspace_id',ll.workspace_id,'customer_id',ll.customer_id,'points_delta',ll.points_delta,'reason',ll.reason,'source_type',ll.source_type,'source_id',ll.source_id,'created_at',ll.created_at) row_json,ll.created_at
      from public.crm_loyalty_ledger ll
      where exists(select 1 from public.customer_users cu where cu.user_id=v_user_id and cu.customer_id=ll.customer_id and cu.workspace_id=ll.workspace_id)
      order by ll.created_at desc limit 50
    ) x;

  return jsonb_build_object('status',case when jsonb_array_length(v_accounts)>0 then 'active' else 'not_enrolled' end,'completed_services',v_completed,'total_spent',round(v_spent,2),'points_balance',v_points,'accounts',v_accounts,'ledger',v_ledger);
end;
$$;

revoke all on function public.get_customer_portal_rewards_v1() from public, anon;
grant execute on function public.get_customer_portal_rewards_v1() to authenticated, service_role;
