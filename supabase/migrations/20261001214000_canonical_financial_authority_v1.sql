-- Canonical financial authority v1
-- Persisted commercial lines are the source of truth. UI/catalog values are never
-- authoritative once a transaction exists.

create or replace function public.money_round_v1(p_value numeric, p_scale integer default 2)
returns numeric
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_factor numeric := power(10::numeric, p_scale);
  v_shift numeric := p_value * v_factor;
  v_trunc numeric := trunc(v_shift);
  v_fraction numeric := abs(v_shift - v_trunc);
  v_rounded numeric;
begin
  if v_fraction = 0.5 then
    if mod(abs(v_trunc), 2) = 0 then
      v_rounded := v_trunc;
    else
      v_rounded := v_trunc + case when v_shift < 0 then -1 else 1 end;
    end if;
  else
    v_rounded := round(v_shift);
  end if;
  return v_rounded / v_factor;
end;
$$;

create or replace function public.sync_appointment_invoice_v1(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_invoice public.invoices%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_item_subtotal numeric := 0;
  v_waste_fee numeric := 0;
  v_shop_fee numeric := 0;
  v_surcharge numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item_count integer := 0;
  v_has_oil boolean := false;
  v_status public.invoice_status;
  v_metadata jsonb;
  v_surcharge_base numeric := 0;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then return null; end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id = v_appt.workspace_id;

  select
    count(*)::integer,
    coalesce(sum(ai.quantity * ai.unit_price), 0),
    coalesce(bool_or(
      lower(coalesce(sc.category,'')) like '%oil%'
      or lower(coalesce(sc.name,'')) like '%oil%'
      or lower(coalesce(ai.description,'')) like '%oil%'
    ), false)
  into v_item_count, v_item_subtotal, v_has_oil
  from public.appointment_items ai
  left join public.service_catalog sc on sc.id = ai.service_catalog_id
  where ai.appointment_id = v_appt.id
    and ai.workspace_id = v_appt.workspace_id
    and public.is_appointment_item_billable_v1(ai);

  v_item_subtotal := public.money_round_v1(greatest(v_item_subtotal, 0), 2);

  if v_item_count > 0 then
    if coalesce(v_settings.waste_oil_fee_enabled, false) and v_has_oil then
      v_waste_fee := public.money_round_v1(greatest(coalesce(v_settings.waste_oil_fee, 0), 0), 2);
    end if;

    if coalesce(v_settings.shop_fee_enabled, false) and greatest(coalesce(v_settings.shop_fee_value, 0), 0) > 0 then
      v_shop_fee := case
        when lower(coalesce(v_settings.shop_fee_type, 'fixed')) = 'percentage'
          then public.money_round_v1(v_item_subtotal * greatest(v_settings.shop_fee_value, 0) / 100, 2)
        else public.money_round_v1(greatest(v_settings.shop_fee_value, 0), 2)
      end;
    end if;

    v_surcharge_base := public.money_round_v1(v_item_subtotal + v_waste_fee + v_shop_fee, 2);
    if coalesce(v_settings.surcharge_enabled, false) and greatest(coalesce(v_settings.surcharge_value, 0), 0) > 0 then
      v_surcharge := case
        when lower(coalesce(v_settings.surcharge_type, 'fixed')) = 'percentage'
          then public.money_round_v1(v_surcharge_base * greatest(v_settings.surcharge_value, 0) / 100, 2)
        else public.money_round_v1(greatest(v_settings.surcharge_value, 0), 2)
      end;
    end if;

    -- Public booking tax is produced by the server-side tax calculator and
    -- transported through booking metadata until canonical line persistence.
    v_tax := public.money_round_v1(greatest(coalesce(
      nullif(v_appt.metadata->>'tax_amount','')::numeric,
      nullif(v_appt.metadata->>'client_tax_amount','')::numeric,
      0
    ), 0), 2);
    v_total := public.money_round_v1(v_item_subtotal + v_waste_fee + v_shop_fee + v_surcharge + v_tax, 2);
  else
    -- Legacy/imported rows without commercial lines remain readable, but the
    -- financial integrity certification will flag them until backfilled.
    v_tax := public.money_round_v1(greatest(coalesce(
      nullif(v_appt.metadata->>'tax_amount','')::numeric,
      nullif(v_appt.metadata->>'client_tax_amount','')::numeric,
      0
    ), 0), 2);
    v_total := public.money_round_v1(greatest(coalesce(nullif(v_appt.metadata->>'estimated_cost','')::numeric, 0), 0), 2);
    v_item_subtotal := public.money_round_v1(greatest(v_total - v_tax, 0), 2);
  end if;

  select * into v_invoice
  from public.invoices
  where metadata->>'appointment_id' = v_appt.id::text
  limit 1;

  if not found then
    insert into public.invoices(
      workspace_id, customer_id, vehicle_id, status, subtotal, tax_total, total,
      amount_paid, issued_at, due_at, created_by, metadata
    ) values (
      v_appt.workspace_id, v_appt.customer_id, v_appt.vehicle_id,
      case when v_appt.status::text in ('cancelled','no_show')
        then 'void'::public.invoice_status else 'issued'::public.invoice_status end,
      public.money_round_v1(v_item_subtotal + v_waste_fee + v_shop_fee + v_surcharge, 2),
      v_tax, v_total, 0, pg_catalog.now(), v_appt.starts_at, v_appt.created_by,
      pg_catalog.jsonb_build_object('appointment_id', v_appt.id::text, 'source', 'appointment_invoice')
    ) returning * into v_invoice;
  else
    if v_appt.status::text in ('cancelled','no_show') and coalesce(v_invoice.amount_paid,0)=0 then
      v_status := 'void'::public.invoice_status;
    elsif coalesce(v_invoice.amount_paid,0) >= v_total and v_total > 0 then
      v_status := 'paid'::public.invoice_status;
    elsif coalesce(v_invoice.amount_paid,0) > 0 then
      v_status := 'partially_paid'::public.invoice_status;
    else
      v_status := 'issued'::public.invoice_status;
    end if;

    update public.invoices
    set customer_id = v_appt.customer_id,
        vehicle_id = v_appt.vehicle_id,
        status = v_status,
        subtotal = public.money_round_v1(v_item_subtotal + v_waste_fee + v_shop_fee + v_surcharge, 2),
        tax_total = v_tax,
        total = v_total,
        due_at = v_appt.starts_at,
        issued_at = coalesce(issued_at, pg_catalog.now()),
        metadata = coalesce(metadata,'{}'::jsonb)
          || pg_catalog.jsonb_build_object('appointment_id', v_appt.id::text, 'source', 'appointment_invoice'),
        updated_at = pg_catalog.now()
    where id = v_invoice.id
    returning * into v_invoice;
  end if;

  delete from public.invoice_lines where invoice_id = v_invoice.id;

  if v_item_count > 0 then
    insert into public.invoice_lines(
      workspace_id, invoice_id, description, quantity, unit_price, tax_rate,
      vehicle_id, service_catalog_id, sort_order, metadata
    )
    select
      ai.workspace_id, v_invoice.id, ai.description, ai.quantity, ai.unit_price, 0,
      coalesce(nullif(ai.metadata->>'vehicle_id','')::uuid, v_appt.vehicle_id),
      ai.service_catalog_id, ai.sort_order,
      coalesce(ai.metadata,'{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'appointment_id', v_appt.id::text,
          'appointment_item_id', ai.id::text,
          'source', 'appointment_item'
        )
    from public.appointment_items ai
    where ai.appointment_id = v_appt.id
      and ai.workspace_id = v_appt.workspace_id
      and public.is_appointment_item_billable_v1(ai)
    order by ai.sort_order, ai.created_at;

    if v_waste_fee > 0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,'Waste Oil Disposal Fee',1,v_waste_fee,0,v_appt.vehicle_id,null,9001,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','waste_oil_fee'));
    end if;
    if v_shop_fee > 0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,coalesce(nullif(v_settings.shop_fee_description,''),'Shop Supplies Fee'),1,v_shop_fee,0,v_appt.vehicle_id,null,9002,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','shop_fee'));
    end if;
    if v_surcharge > 0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,coalesce(nullif(v_settings.surcharge_description,''),'Card Processing Fee'),1,v_surcharge,0,v_appt.vehicle_id,null,9003,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','surcharge'));
    end if;
  end if;

  v_metadata := coalesce(v_appt.metadata,'{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'estimated_cost', v_total,
      'tax_amount', v_tax,
      'invoice_id', v_invoice.id::text,
      'invoice_number', v_invoice.invoice_number,
      'pricing_state', case when v_item_count > 0 then 'canonical' else 'missing_lines' end
    );
  if coalesce(v_appt.metadata,'{}'::jsonb) is distinct from v_metadata then
    update public.appointments
    set metadata = v_metadata, updated_at = pg_catalog.now()
    where id = v_appt.id;
  end if;

  return v_invoice.id;
end;
$$;

-- Recover public bookings that captured immutable service prices but failed to
-- persist appointment_items. Do not reprice from the current catalog.
insert into public.appointment_items(
  workspace_id, appointment_id, service_catalog_id, item_type, description,
  quantity, unit_price, is_prepaid, added_at_service, sort_order, metadata
)
select
  a.workspace_id,
  a.id,
  case
    when nullif(svc->>'id','') is not null
      and exists(select 1 from public.service_catalog sc where sc.id = (svc->>'id')::uuid and sc.workspace_id = a.workspace_id)
    then (svc->>'id')::uuid
    else null
  end,
  'service',
  coalesce(nullif(svc->>'name',''), 'Service'),
  greatest(coalesce(nullif(svc->>'quantity','')::numeric, 1), 0.0001),
  greatest(coalesce(nullif(svc->>'price','')::numeric, 0), 0),
  false,
  false,
  row_number() over(partition by a.id order by vehicle.ordinality, service.ordinality) - 1,
  pg_catalog.jsonb_build_object(
    'source','public_booking_snapshot_recovery',
    'vehicle_id', coalesce(nullif(vehicle.value->>'persistedVehicleId',''), a.vehicle_id::text),
    'price_source','immutable_booking_configuration'
  )
from public.appointments a
cross join lateral jsonb_array_elements(
  coalesce(a.metadata->'booking_configuration'->'vehicles','[]'::jsonb)
) with ordinality as vehicle(value, ordinality)
cross join lateral jsonb_array_elements(
  coalesce(vehicle.value->'services','[]'::jsonb)
) with ordinality as service(svc, ordinality)
where a.source = 'public_booking'
  and not exists(
    select 1 from public.appointment_items ai
    where ai.workspace_id = a.workspace_id and ai.appointment_id = a.id
  )
  and jsonb_typeof(coalesce(vehicle.value->'services','[]'::jsonb)) = 'array';

-- Reconcile every appointment touched by the recovery, and any public booking
-- still marked as pending/missing canonical pricing.
do $$
declare r record;
begin
  for r in
    select a.id
    from public.appointments a
    where a.source='public_booking'
      and (
        exists(select 1 from public.appointment_items ai where ai.appointment_id=a.id and ai.workspace_id=a.workspace_id)
        or coalesce(a.metadata->>'pricing_state','') in ('pending_canonical_items','missing_lines')
      )
  loop
    perform public.sync_appointment_invoice_v1(r.id);
  end loop;
end;
$$;

-- Runtime certification surface. This reports mismatches; it does not mutate.
create or replace function public.financial_integrity_issues_v1(p_workspace_id uuid)
returns table(
  entity_type text,
  entity_id uuid,
  issue_code text,
  expected numeric,
  actual numeric,
  detail text
)
language sql
security invoker
set search_path = ''
as $$
  with quote_line_totals as (
    select q.id, q.subtotal, q.tax_total, q.total,
           coalesce(sum(qi.total_price),0) line_subtotal
    from public.quotes q
    left join public.quote_items qi on qi.quote_id=q.id and qi.workspace_id=q.workspace_id
    where q.workspace_id=p_workspace_id
    group by q.id,q.subtotal,q.tax_total,q.total
  ),
  invoice_line_totals as (
    select i.id, i.subtotal, i.tax_total, i.total, i.amount_paid,
           coalesce(sum(il.quantity*il.unit_price),0) line_subtotal
    from public.invoices i
    left join public.invoice_lines il on il.invoice_id=i.id and il.workspace_id=i.workspace_id
    where i.workspace_id=p_workspace_id and i.status::text <> 'void'
    group by i.id,i.subtotal,i.tax_total,i.total,i.amount_paid
  ),
  service_line_totals as (
    select sr.id,sr.subtotal,sr.tax_amount,sr.discount_amount,sr.total_amount,
           coalesce(sum(sli.total_price),0) line_subtotal
    from public.service_records sr
    left join public.service_record_line_items sli on sli.service_record_id=sr.id and sli.workspace_id=sr.workspace_id
    where sr.workspace_id=p_workspace_id and sr.status <> 'voided'
    group by sr.id,sr.subtotal,sr.tax_amount,sr.discount_amount,sr.total_amount
  )
  select 'quote',id,'quote_subtotal_mismatch',public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),'quote header subtotal must equal persisted quote lines'
  from quote_line_totals where public.money_round_v1(line_subtotal,2) <> public.money_round_v1(coalesce(subtotal,0),2)
  union all
  select 'quote',id,'quote_total_mismatch',public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2),public.money_round_v1(coalesce(total,0),2),'quote total must equal subtotal + tax'
  from quote_line_totals where public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2) <> public.money_round_v1(coalesce(total,0),2)
  union all
  select 'invoice',id,'invoice_subtotal_mismatch',public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),'invoice header subtotal must equal persisted invoice lines'
  from invoice_line_totals where public.money_round_v1(line_subtotal,2) <> public.money_round_v1(coalesce(subtotal,0),2)
  union all
  select 'invoice',id,'invoice_total_mismatch',public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2),public.money_round_v1(coalesce(total,0),2),'invoice total must equal subtotal + tax'
  from invoice_line_totals where public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2) <> public.money_round_v1(coalesce(total,0),2)
  union all
  select 'invoice',id,'invoice_overpaid',public.money_round_v1(coalesce(total,0),2),public.money_round_v1(coalesce(amount_paid,0),2),'amount paid cannot exceed invoice total'
  from invoice_line_totals where coalesce(amount_paid,0) > coalesce(total,0) + 0.009
  union all
  select 'service_record',id,'service_subtotal_mismatch',public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),'service record subtotal must equal persisted service lines'
  from service_line_totals where public.money_round_v1(line_subtotal,2) <> public.money_round_v1(coalesce(subtotal,0),2)
  union all
  select 'service_record',id,'service_total_mismatch',public.money_round_v1(coalesce(subtotal,0)-coalesce(discount_amount,0)+coalesce(tax_amount,0),2),public.money_round_v1(coalesce(total_amount,0),2),'service total must equal subtotal - discount + tax'
  from service_line_totals where public.money_round_v1(coalesce(subtotal,0)-coalesce(discount_amount,0)+coalesce(tax_amount,0),2) <> public.money_round_v1(coalesce(total_amount,0),2)
  union all
  select 'appointment',a.id,'appointment_missing_commercial_lines',null,null,'appointment has no persisted commercial line items'
  from public.appointments a
  where a.workspace_id=p_workspace_id
    and a.status::text not in ('cancelled','no_show')
    and a.source in ('public_booking','staff')
    and not exists(select 1 from public.appointment_items ai where ai.workspace_id=a.workspace_id and ai.appointment_id=a.id);
$$;

revoke all on function public.financial_integrity_issues_v1(uuid) from public, anon;
grant execute on function public.financial_integrity_issues_v1(uuid) to authenticated, service_role;
