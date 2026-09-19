-- Closeout remains appointment-scoped financially, but creates/reuses one service history row per vehicle.
create or replace function public.complete_appointment_closeout_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_appt public.appointments%rowtype;
  v_service_ids uuid[];
  v_service_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_invoice_number bigint;
  v_subtotal numeric:=0;
  v_tax numeric:=0;
  v_total numeric:=0;
  v_amount_paid numeric:=0;
  v_balance_due numeric:=0;
  v_item_count integer:=0;
  v_payment_status public.payment_status;
  v_invoice_status public.invoice_status;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  select * into v_appt from public.appointments where id=p_appointment_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  -- Explicit readiness assertion plus the existing status triggers form a defense-in-depth gate.
  perform public.assert_appointment_ready_for_closeout_v1(p_workspace_id,p_appointment_id);
  update public.appointments set status='completed',updated_at=now()
   where id=p_appointment_id and workspace_id=p_workspace_id;

  v_service_ids:=public.sync_appointment_vehicle_service_records_v1(p_workspace_id,p_appointment_id);
  v_service_id:=v_service_ids[1];

  v_invoice_id:=public.sync_appointment_invoice_v1(p_appointment_id);
  if v_invoice_id is null then raise exception 'Appointment invoice could not be created'; end if;
  perform public.apply_appointment_card_fee_v1(p_workspace_id,p_appointment_id,v_invoice_id);

  select count(*) into v_item_count from public.appointment_items
   where workspace_id=p_workspace_id and appointment_id=p_appointment_id;

  select invoice_number,status,subtotal,tax_total,total,amount_paid
    into v_invoice_number,v_invoice_status,v_subtotal,v_tax,v_total,v_amount_paid
    from public.invoices where workspace_id=p_workspace_id and id=v_invoice_id for update;

  update public.service_records sr set
    subtotal=coalesce(x.vehicle_subtotal,0),
    tax_amount=0,
    total_amount=coalesce(x.vehicle_subtotal,0),
    currency_code='USD',
    metadata=coalesce(sr.metadata,'{}'::jsonb)||jsonb_build_object(
      'financial_source','appointment_closeout',
      'invoice_id',v_invoice_id,
      'aggregate_invoice_total',v_total,
      'card_fee_amount',coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0)
    ),
    updated_at=now()
  from (
    select coalesce((ai.metadata->>'vehicle_id')::uuid,v_appt.vehicle_id) vehicle_id,
           round(sum(ai.quantity*ai.unit_price)::numeric,2) vehicle_subtotal
    from public.appointment_items ai
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and public.is_appointment_item_billable_v1(ai)
    group by coalesce((ai.metadata->>'vehicle_id')::uuid,v_appt.vehicle_id)
  ) x
  where sr.workspace_id=p_workspace_id and sr.appointment_id=p_appointment_id and sr.vehicle_id=x.vehicle_id;

  update public.payments set
    invoice_id=v_invoice_id,
    customer_id=coalesce(customer_id,v_appt.customer_id),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'invoice_id',v_invoice_id,'service_record_ids',to_jsonb(v_service_ids),'prepaid_reconciled_at',now(),
      'card_fee_amount',coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0),
      'card_fee_cents',round(coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0)*100)::integer
    ),updated_at=now()
  where workspace_id=p_workspace_id
    and metadata->>'appointment_id'=p_appointment_id::text
    and status in ('succeeded'::public.payment_status,'partially_refunded'::public.payment_status)
    and invoice_id is distinct from v_invoice_id;

  -- payment reconciliation is trigger-driven when payment rows are linked/updated.
  select status,subtotal,tax_total,total,amount_paid into v_invoice_status,v_subtotal,v_tax,v_total,v_amount_paid
   from public.invoices where workspace_id=p_workspace_id and id=v_invoice_id;
  v_balance_due:=round(greatest(v_total-coalesce(v_amount_paid,0),0),2);

  select id,status into v_payment_id,v_payment_status from public.payments
   where workspace_id=p_workspace_id
     and metadata->>'appointment_id'=p_appointment_id::text
     and (invoice_id is null or invoice_id=v_invoice_id)
     and status='pending'::public.payment_status
   order by (metadata->>'source'='appointment_completion') desc,created_at asc
   limit 1 for update;

  if v_balance_due>0 then
    if v_payment_id is null then
      insert into public.payments(workspace_id,invoice_id,customer_id,provider,provider_payment_id,status,amount,currency_code,created_by,metadata)
      values(p_workspace_id,v_invoice_id,v_appt.customer_id,null,null,'pending'::public.payment_status,v_balance_due,'USD',v_actor,
        jsonb_build_object('appointment_id',p_appointment_id,'service_record_ids',to_jsonb(v_service_ids),'invoice_id',v_invoice_id,'source','appointment_completion','payment_type','pay_at_service','invoice_total',v_total,'prepaid_amount',v_amount_paid,'balance_due',v_balance_due,
        'card_fee_amount',coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0),
        'card_fee_cents',round(coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0)*100)::integer))
      returning id,status into v_payment_id,v_payment_status;
    else
      update public.payments set invoice_id=v_invoice_id,customer_id=v_appt.customer_id,amount=v_balance_due,currency_code='USD',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','appointment_completion','payment_type','pay_at_service','service_record_ids',to_jsonb(v_service_ids),'invoice_id',v_invoice_id,'invoice_total',v_total,'prepaid_amount',v_amount_paid,'balance_due',v_balance_due,
        'card_fee_amount',coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0),
        'card_fee_cents',round(coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0)*100)::integer),
        updated_at=now()
      where workspace_id=p_workspace_id and id=v_payment_id;
    end if;
  else
    update public.payments set status='failed'::public.payment_status,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('closed_reason','invoice_fully_prepaid','closed_at',now(),'balance_due',0),updated_at=now()
    where workspace_id=p_workspace_id and invoice_id=v_invoice_id
      and metadata->>'source'='appointment_completion' and status='pending'::public.payment_status;
    select id,status into v_payment_id,v_payment_status from public.payments
     where workspace_id=p_workspace_id and invoice_id=v_invoice_id
       and status in ('succeeded'::public.payment_status,'partially_refunded'::public.payment_status)
     order by paid_at desc nulls last,created_at asc limit 1;
  end if;

  return jsonb_build_object(
    'appointment_id',p_appointment_id,
    'service_record_id',v_service_id,
    'service_record_ids',to_jsonb(v_service_ids),
    'invoice_id',v_invoice_id,'invoice_number',v_invoice_number,'invoice_status',v_invoice_status,
    'payment_id',v_payment_id,'payment_status',v_payment_status,'subtotal',v_subtotal,'tax_amount',v_tax,
    'card_fee_amount',coalesce((select nullif(metadata->>'card_fee_amount','')::numeric from public.invoices where id=v_invoice_id),0),
    'total',v_total,'amount_paid',v_amount_paid,'balance_due',v_balance_due,'currency_code','USD'
  );
end $$;

revoke all on function public.complete_appointment_closeout_v1(uuid,uuid) from public,anon;
grant execute on function public.complete_appointment_closeout_v1(uuid,uuid) to authenticated,service_role;
