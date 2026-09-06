-- Canonical job closeout: completion creates one service record, one invoice,
-- and one receivable payment record. Re-entry is idempotent.
create unique index if not exists invoices_workspace_appointment_uidx
  on public.invoices (workspace_id, ((metadata ->> 'appointment_id')))
  where (metadata ? 'appointment_id') and status <> 'void'::public.invoice_status;

create unique index if not exists payments_workspace_closeout_appointment_pending_uidx
  on public.payments (workspace_id, ((metadata ->> 'appointment_id')))
  where status = 'pending'::public.payment_status
    and (metadata ->> 'source') = 'appointment_completion';

create or replace function public.complete_appointment_closeout_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_service_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_invoice_number bigint;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item_count integer := 0;
  v_payment_status public.payment_status;
  v_invoice_status public.invoice_status;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;

  select * into v_appt from public.appointments
   where id = p_appointment_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  v_service_id := public.complete_appointment_v1(p_workspace_id, p_appointment_id);

  select count(*), coalesce(sum(quantity * unit_price), 0)
    into v_item_count, v_subtotal
    from public.appointment_items
   where workspace_id = p_workspace_id and appointment_id = p_appointment_id;

  if v_item_count = 0 or v_subtotal <= 0 then
    select coalesce(sr.subtotal, 0) into v_subtotal
      from public.service_records sr
     where sr.workspace_id = p_workspace_id and sr.id = v_service_id;
    if coalesce(v_subtotal, 0) <= 0 then
      v_subtotal := case when jsonb_typeof(v_appt.metadata -> 'estimated_cost') = 'number'
        then (v_appt.metadata ->> 'estimated_cost')::numeric else 0 end;
    end if;
  end if;

  select coalesce(sr.tax_amount, 0) into v_tax
    from public.service_records sr
   where sr.workspace_id = p_workspace_id and sr.id = v_service_id;
  if coalesce(v_tax, 0) = 0 and jsonb_typeof(v_appt.metadata -> 'tax_amount') = 'number' then
    v_tax := (v_appt.metadata ->> 'tax_amount')::numeric;
  end if;

  v_subtotal := round(greatest(coalesce(v_subtotal, 0), 0), 2);
  v_tax := round(greatest(coalesce(v_tax, 0), 0), 2);
  v_total := round(v_subtotal + v_tax, 2);

  update public.service_records
     set subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total,
         currency_code = 'USD',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'financial_source', 'appointment_closeout', 'appointment_item_count', v_item_count),
         updated_at = now()
   where workspace_id = p_workspace_id and id = v_service_id;

  select id, invoice_number, status into v_invoice_id, v_invoice_number, v_invoice_status
    from public.invoices
   where workspace_id = p_workspace_id
     and metadata ->> 'appointment_id' = p_appointment_id::text
     and status <> 'void'::public.invoice_status
   order by created_at asc limit 1 for update;

  if v_invoice_id is null then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':invoice_number', 0));
    select coalesce(max(invoice_number), 0) + 1 into v_invoice_number
      from public.invoices where workspace_id = p_workspace_id;

    insert into public.invoices(
      workspace_id, customer_id, vehicle_id, status, invoice_number,
      subtotal, tax_total, total, amount_paid, issued_at, created_by, metadata
    ) values (
      p_workspace_id, v_appt.customer_id, v_appt.vehicle_id, 'issued'::public.invoice_status,
      v_invoice_number, v_subtotal, v_tax, v_total, 0, now(), v_actor,
      jsonb_build_object('appointment_id', p_appointment_id, 'service_record_id', v_service_id,
        'source', 'appointment_completion', 'payment_terms', 'Due on receipt')
    ) returning id, status into v_invoice_id, v_invoice_status;

    insert into public.invoice_lines(
      workspace_id, invoice_id, vehicle_id, service_catalog_id,
      description, quantity, unit_price, tax_rate, sort_order, metadata
    )
    select p_workspace_id, v_invoice_id, v_appt.vehicle_id, ai.service_catalog_id,
      ai.description, ai.quantity, ai.unit_price, 0, ai.sort_order,
      coalesce(ai.metadata, '{}'::jsonb) || jsonb_build_object('appointment_item_id', ai.id)
      from public.appointment_items ai
     where ai.workspace_id = p_workspace_id and ai.appointment_id = p_appointment_id
     order by ai.sort_order, ai.created_at;

    if not found then
      insert into public.invoice_lines(
        workspace_id, invoice_id, vehicle_id, description, quantity, unit_price, tax_rate, sort_order, metadata
      ) values (
        p_workspace_id, v_invoice_id, v_appt.vehicle_id,
        coalesce(nullif(v_appt.metadata ->> 'title', ''), 'Completed service'),
        1, v_subtotal, 0, 0, jsonb_build_object('source', 'appointment_completion_fallback'));
    end if;
  end if;

  select id, status into v_payment_id, v_payment_status
    from public.payments
   where workspace_id = p_workspace_id
     and metadata ->> 'appointment_id' = p_appointment_id::text
     and status in ('pending'::public.payment_status, 'succeeded'::public.payment_status,
                    'partially_refunded'::public.payment_status)
   order by created_at asc limit 1 for update;

  if v_payment_id is null then
    insert into public.payments(
      workspace_id, invoice_id, customer_id, provider, provider_payment_id,
      status, amount, currency_code, created_by, metadata
    ) values (
      p_workspace_id, v_invoice_id, v_appt.customer_id, null, null,
      'pending'::public.payment_status, v_total, 'USD', v_actor,
      jsonb_build_object('appointment_id', p_appointment_id, 'service_record_id', v_service_id,
        'invoice_id', v_invoice_id, 'source', 'appointment_completion',
        'payment_type', 'pay_at_service', 'subtotal', v_subtotal, 'tax_amount', v_tax,
        'subtotal_cents', round(v_subtotal * 100), 'tax_amount_cents', round(v_tax * 100))
    ) returning id, status into v_payment_id, v_payment_status;
  elsif v_payment_status = 'pending'::public.payment_status then
    update public.payments
       set invoice_id = v_invoice_id, customer_id = v_appt.customer_id, amount = v_total,
           currency_code = 'USD',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'invoice_id', v_invoice_id, 'service_record_id', v_service_id,
             'subtotal', v_subtotal, 'tax_amount', v_tax,
             'subtotal_cents', round(v_subtotal * 100), 'tax_amount_cents', round(v_tax * 100)),
           updated_at = now()
     where workspace_id = p_workspace_id and id = v_payment_id;
  end if;

  return jsonb_build_object(
    'appointment_id', p_appointment_id, 'service_record_id', v_service_id,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'invoice_status', v_invoice_status, 'payment_id', v_payment_id,
    'payment_status', v_payment_status, 'subtotal', v_subtotal,
    'tax_amount', v_tax, 'total', v_total, 'currency_code', 'USD');
end;
$$;

revoke all on function public.complete_appointment_closeout_v1(uuid, uuid) from public, anon;
grant execute on function public.complete_appointment_closeout_v1(uuid, uuid) to authenticated, service_role;
comment on function public.complete_appointment_closeout_v1(uuid, uuid) is
  'Canonical idempotent appointment closeout. Completes service and atomically creates/reuses invoice and receivable payment record.';
