-- Financial authority v2
-- Invoice headers are derived server-side from persisted invoice lines and
-- explicit commercial inputs. Client-provided subtotal/tax/total are ignored.

create or replace function public.create_invoice_v1(
  p_workspace_id uuid,
  p_header jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_metadata jsonb := coalesce(p_header->'metadata','{}'::jsonb);
  v_line_subtotal numeric := 0;
  v_waste_fee numeric := 0;
  v_shop_fee numeric := 0;
  v_surcharge numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if jsonb_typeof(coalesce(p_header,'{}'::jsonb)) <> 'object' then raise exception 'p_header must be a JSON object'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then raise exception 'p_lines must be a JSON array'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Invoice requires at least one commercial line'; end if;

  select coalesce(sum(
    greatest(coalesce(nullif(item->>'quantity','')::numeric,0),0)
    * greatest(coalesce(nullif(item->>'unit_price','')::numeric,0),0)
  ),0)
  into v_line_subtotal
  from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item;

  v_line_subtotal := public.money_round_v1(v_line_subtotal,2);

  if coalesce((v_metadata->>'waste_oil_fee_enabled')::boolean,false) then
    v_waste_fee := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'waste_oil_fee','')::numeric,0),0),2);
  end if;
  if coalesce((v_metadata->>'shop_fee_enabled')::boolean,false) then
    v_shop_fee := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'shop_fee','')::numeric,0),0),2);
  end if;
  if coalesce((v_metadata->>'surcharge_enabled')::boolean,false) then
    v_surcharge := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'surcharge','')::numeric,0),0),2);
  end if;

  v_subtotal := public.money_round_v1(v_line_subtotal + v_waste_fee + v_shop_fee + v_surcharge,2);
  v_discount := public.money_round_v1(
    least(greatest(coalesce(nullif(v_metadata->>'discount_amount','')::numeric,0),0),v_subtotal),
    2
  );

  if coalesce((v_metadata->>'tax_enabled')::boolean,false) then
    v_tax_rate := greatest(coalesce(nullif(v_metadata->>'tax_rate','')::numeric,0),0);
    v_tax := public.money_round_v1(greatest(v_subtotal-v_discount,0) * v_tax_rate / 100,2);
  end if;
  v_total := public.money_round_v1(greatest(v_subtotal-v_discount,0) + v_tax,2);

  insert into public.invoices(
    workspace_id, customer_id, vehicle_id, work_order_id, status, invoice_number,
    subtotal, tax_total, total, amount_paid, issued_at, due_at, created_by, metadata
  ) values (
    p_workspace_id,
    nullif(p_header->>'customer_id','')::uuid,
    nullif(p_header->>'vehicle_id','')::uuid,
    nullif(p_header->>'work_order_id','')::uuid,
    coalesce(nullif(p_header->>'status','')::public.invoice_status,'draft'::public.invoice_status),
    nullif(p_header->>'invoice_number','')::bigint,
    v_subtotal,
    v_tax,
    v_total,
    0,
    nullif(p_header->>'issued_at','')::timestamptz,
    nullif(p_header->>'due_at','')::timestamptz,
    v_actor,
    v_metadata || jsonb_build_object(
      'financial_authority','invoice_lines_v2',
      'computed_discount_amount',v_discount
    )
  ) returning id into v_id;

  insert into public.invoice_lines(
    workspace_id, invoice_id, vehicle_id, service_catalog_id,
    description, quantity, unit_price, tax_rate, sort_order, metadata
  )
  select
    p_workspace_id,
    v_id,
    nullif(item->>'vehicle_id','')::uuid,
    nullif(item->>'service_catalog_id','')::uuid,
    item->>'description',
    greatest((item->>'quantity')::numeric,0),
    greatest((item->>'unit_price')::numeric,0),
    coalesce(nullif(item->>'tax_rate','')::numeric,0),
    coalesce(nullif(item->>'sort_order','')::integer,ordinality-1),
    coalesce(item->'metadata','{}'::jsonb)
      || jsonb_build_object('source','invoice_commercial_line')
  from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality as x(item,ordinality);

  if v_waste_fee > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,v_id,'Waste Oil Disposal Fee',1,v_waste_fee,0,9001,jsonb_build_object('source','invoice_fee','fee_key','waste_oil_fee'));
  end if;
  if v_shop_fee > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,v_id,'Shop Supplies Fee',1,v_shop_fee,0,9002,jsonb_build_object('source','invoice_fee','fee_key','shop_fee'));
  end if;
  if v_surcharge > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,v_id,'Processing Fee',1,v_surcharge,0,9003,jsonb_build_object('source','invoice_fee','fee_key','surcharge'));
  end if;

  return v_id;
end;
$$;

create or replace function public.patch_draft_invoice_v1(
  p_workspace_id uuid,
  p_invoice_id uuid,
  p_patch jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
set search_path = 'public'
as $$
declare
  v_status public.invoice_status;
  v_existing_metadata jsonb;
  v_metadata jsonb;
  v_line_subtotal numeric := 0;
  v_waste_fee numeric := 0;
  v_shop_fee numeric := 0;
  v_surcharge numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object' then raise exception 'p_patch must be a JSON object'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then raise exception 'p_lines must be a JSON array'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Invoice requires at least one commercial line'; end if;

  select status,coalesce(metadata,'{}'::jsonb)
  into v_status,v_existing_metadata
  from public.invoices
  where workspace_id=p_workspace_id and id=p_invoice_id
  for update;

  if not found then raise exception 'Invoice not found'; end if;
  if v_status <> 'draft'::public.invoice_status then raise exception 'Invoice lines can only be replaced while invoice is draft'; end if;

  v_metadata := case
    when p_patch ? 'metadata' then coalesce(p_patch->'metadata','{}'::jsonb)
    else v_existing_metadata
  end;

  select coalesce(sum(
    greatest(coalesce(nullif(item->>'quantity','')::numeric,0),0)
    * greatest(coalesce(nullif(item->>'unit_price','')::numeric,0),0)
  ),0)
  into v_line_subtotal
  from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item;
  v_line_subtotal := public.money_round_v1(v_line_subtotal,2);

  if coalesce((v_metadata->>'waste_oil_fee_enabled')::boolean,false) then
    v_waste_fee := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'waste_oil_fee','')::numeric,0),0),2);
  end if;
  if coalesce((v_metadata->>'shop_fee_enabled')::boolean,false) then
    v_shop_fee := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'shop_fee','')::numeric,0),0),2);
  end if;
  if coalesce((v_metadata->>'surcharge_enabled')::boolean,false) then
    v_surcharge := public.money_round_v1(greatest(coalesce(nullif(v_metadata->>'surcharge','')::numeric,0),0),2);
  end if;

  v_subtotal := public.money_round_v1(v_line_subtotal+v_waste_fee+v_shop_fee+v_surcharge,2);
  v_discount := public.money_round_v1(
    least(greatest(coalesce(nullif(v_metadata->>'discount_amount','')::numeric,0),0),v_subtotal),
    2
  );
  if coalesce((v_metadata->>'tax_enabled')::boolean,false) then
    v_tax_rate := greatest(coalesce(nullif(v_metadata->>'tax_rate','')::numeric,0),0);
    v_tax := public.money_round_v1(greatest(v_subtotal-v_discount,0)*v_tax_rate/100,2);
  end if;
  v_total := public.money_round_v1(greatest(v_subtotal-v_discount,0)+v_tax,2);

  update public.invoices
  set
    customer_id=case when p_patch?'customer_id' then nullif(p_patch->>'customer_id','')::uuid else customer_id end,
    vehicle_id=case when p_patch?'vehicle_id' then nullif(p_patch->>'vehicle_id','')::uuid else vehicle_id end,
    work_order_id=case when p_patch?'work_order_id' then nullif(p_patch->>'work_order_id','')::uuid else work_order_id end,
    status=case when p_patch?'status' then (p_patch->>'status')::public.invoice_status else status end,
    due_at=case when p_patch?'due_at' then nullif(p_patch->>'due_at','')::timestamptz else due_at end,
    issued_at=case when p_patch?'issued_at' then nullif(p_patch->>'issued_at','')::timestamptz else issued_at end,
    subtotal=v_subtotal,
    tax_total=v_tax,
    total=v_total,
    metadata=v_metadata || jsonb_build_object(
      'financial_authority','invoice_lines_v2',
      'computed_discount_amount',v_discount
    ),
    updated_at=now()
  where workspace_id=p_workspace_id and id=p_invoice_id;

  delete from public.invoice_lines
  where workspace_id=p_workspace_id and invoice_id=p_invoice_id;

  insert into public.invoice_lines(
    workspace_id,invoice_id,vehicle_id,service_catalog_id,
    description,quantity,unit_price,tax_rate,sort_order,metadata
  )
  select
    p_workspace_id,
    p_invoice_id,
    nullif(item->>'vehicle_id','')::uuid,
    nullif(item->>'service_catalog_id','')::uuid,
    item->>'description',
    greatest((item->>'quantity')::numeric,0),
    greatest((item->>'unit_price')::numeric,0),
    coalesce(nullif(item->>'tax_rate','')::numeric,0),
    coalesce(nullif(item->>'sort_order','')::integer,ordinality-1),
    coalesce(item->'metadata','{}'::jsonb)
      || jsonb_build_object('source','invoice_commercial_line')
  from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality as x(item,ordinality);

  if v_waste_fee > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,p_invoice_id,'Waste Oil Disposal Fee',1,v_waste_fee,0,9001,jsonb_build_object('source','invoice_fee','fee_key','waste_oil_fee'));
  end if;
  if v_shop_fee > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,p_invoice_id,'Shop Supplies Fee',1,v_shop_fee,0,9002,jsonb_build_object('source','invoice_fee','fee_key','shop_fee'));
  end if;
  if v_surcharge > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,p_invoice_id,'Processing Fee',1,v_surcharge,0,9003,jsonb_build_object('source','invoice_fee','fee_key','surcharge'));
  end if;

  return p_invoice_id;
end;
$$;

-- Repair the one operational draft quote that has a canonical header amount
-- but predates quote line persistence. Preserve its stored historical amount.
insert into public.quote_items(
  quote_id,workspace_id,description,quantity,unit_price,total_price
)
select
  q.id,q.workspace_id,
  coalesce(nullif(q.metadata->>'description',''),'Legacy quote amount'),
  1,q.subtotal,q.subtotal
from public.quotes q
where q.id='e04ece37-f77a-4b4e-ab44-1177e2f05f38'::uuid
  and q.status='draft'
  and q.subtotal>0
  and not exists(select 1 from public.quote_items qi where qi.quote_id=q.id and qi.workspace_id=q.workspace_id);

-- Reconcile historical completed service records without inventing detail.
-- These rows predate service_record_line_items; preserve the stored subtotal
-- exactly as one explicit legacy line.
insert into public.service_record_line_items(
  workspace_id,service_record_id,item_type,description,quantity,unit_price,total_price,sort_order,metadata
)
select
  sr.workspace_id,sr.id,'labor'::public.service_record_line_item_type,
  'Legacy service amount',1,sr.subtotal,sr.subtotal,0,
  jsonb_build_object(
    'source','legacy_header_reconciliation',
    'reconciled_at',now(),
    'detail','Historical header total preserved; original itemization was not available'
  )
from public.service_records sr
where sr.status<>'voided'
  and coalesce(sr.subtotal,0)>0
  and not exists(
    select 1 from public.service_record_line_items li
    where li.workspace_id=sr.workspace_id and li.service_record_id=sr.id
  );

-- Completed staff appointments that predate the appointment line ledger remain
-- historical all-in amounts. Mark them explicitly so current certification
-- never mistakes missing historical detail for a current pricing path.
update public.appointments a
set metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object(
  'pricing_state','legacy_header_only',
  'financial_integrity_mode','legacy_header_only'
)
where a.id in (
  '2e724e69-0f79-4f3c-9032-80249d081528'::uuid,
  '47b8f4cf-2eab-4d2a-86e1-eee1bd5a9bb2'::uuid
)
and a.status::text='completed'
and not exists(
  select 1 from public.appointment_items ai
  where ai.workspace_id=a.workspace_id and ai.appointment_id=a.id
);

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
set search_path=''
as $$
  with quote_line_totals as (
    select q.id,q.subtotal,q.tax_total,q.total,
           coalesce(sum(qi.total_price),0) line_subtotal
    from public.quotes q
    left join public.quote_items qi on qi.quote_id=q.id and qi.workspace_id=q.workspace_id
    where q.workspace_id=p_workspace_id
    group by q.id,q.subtotal,q.tax_total,q.total
  ),
  invoice_line_totals as (
    select i.id,i.subtotal,i.tax_total,i.total,i.amount_paid,i.metadata,
           coalesce(sum(il.quantity*il.unit_price),0) line_subtotal
    from public.invoices i
    left join public.invoice_lines il on il.invoice_id=i.id and il.workspace_id=i.workspace_id
    where i.workspace_id=p_workspace_id and i.status::text<>'void'
    group by i.id,i.subtotal,i.tax_total,i.total,i.amount_paid,i.metadata
  ),
  service_line_totals as (
    select sr.id,sr.subtotal,sr.tax_amount,sr.discount_amount,sr.total_amount,
           coalesce(sum(sli.total_price),0) line_subtotal
    from public.service_records sr
    left join public.service_record_line_items sli
      on sli.service_record_id=sr.id and sli.workspace_id=sr.workspace_id
    where sr.workspace_id=p_workspace_id and sr.status<>'voided'
    group by sr.id,sr.subtotal,sr.tax_amount,sr.discount_amount,sr.total_amount
  ),
  invoice_payment_totals as (
    select i.id,
           coalesce(sum(case when p.status::text='succeeded' then p.amount else 0 end),0) succeeded_paid,
           i.amount_paid
    from public.invoices i
    left join public.payments p on p.workspace_id=i.workspace_id and p.invoice_id=i.id
    where i.workspace_id=p_workspace_id and i.status::text<>'void'
    group by i.id,i.amount_paid
  ),
  work_order_invoice_totals as (
    select wo.id,
           coalesce(sum(woi.quantity*woi.unit_price),0) work_order_lines,
           i.id invoice_id,
           coalesce(sum(il.quantity*il.unit_price)
             filter(where coalesce(il.metadata->>'source','')='invoice_commercial_line'),0) invoice_commercial_lines
    from public.work_orders wo
    left join public.work_order_items woi
      on woi.workspace_id=wo.workspace_id and woi.work_order_id=wo.id
    left join public.invoices i
      on i.workspace_id=wo.workspace_id and i.work_order_id=wo.id and i.status::text<>'void'
    left join public.invoice_lines il
      on il.workspace_id=i.workspace_id and il.invoice_id=i.id
    where wo.workspace_id=p_workspace_id
    group by wo.id,i.id
  )
  select 'quote',id,'quote_subtotal_mismatch',
         public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),
         'quote header subtotal must equal persisted quote lines'
  from quote_line_totals
  where public.money_round_v1(line_subtotal,2)<>public.money_round_v1(coalesce(subtotal,0),2)

  union all
  select 'quote',id,'quote_total_mismatch',
         public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2),
         public.money_round_v1(coalesce(total,0),2),
         'quote total must equal subtotal + tax'
  from quote_line_totals
  where public.money_round_v1(coalesce(subtotal,0)+coalesce(tax_total,0),2)<>public.money_round_v1(coalesce(total,0),2)

  union all
  select 'invoice',id,'invoice_subtotal_mismatch',
         public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),
         'invoice header subtotal must equal persisted invoice lines'
  from invoice_line_totals
  where public.money_round_v1(line_subtotal,2)<>public.money_round_v1(coalesce(subtotal,0),2)

  union all
  select 'invoice',id,'invoice_total_mismatch',
         public.money_round_v1(
           coalesce(subtotal,0)
           - least(greatest(coalesce(nullif(metadata->>'computed_discount_amount','')::numeric,
                                     nullif(metadata->>'discount_amount','')::numeric,0),0),coalesce(subtotal,0))
           + coalesce(tax_total,0),2),
         public.money_round_v1(coalesce(total,0),2),
         'invoice total must equal subtotal - discount + tax'
  from invoice_line_totals
  where public.money_round_v1(
           coalesce(subtotal,0)
           - least(greatest(coalesce(nullif(metadata->>'computed_discount_amount','')::numeric,
                                     nullif(metadata->>'discount_amount','')::numeric,0),0),coalesce(subtotal,0))
           + coalesce(tax_total,0),2)
        <> public.money_round_v1(coalesce(total,0),2)

  union all
  select 'invoice',id,'invoice_overpaid',
         public.money_round_v1(coalesce(total,0),2),public.money_round_v1(coalesce(amount_paid,0),2),
         'amount paid cannot exceed invoice total'
  from invoice_line_totals
  where coalesce(amount_paid,0)>coalesce(total,0)+0.009

  union all
  select 'invoice',id,'payment_ledger_mismatch',
         public.money_round_v1(succeeded_paid,2),public.money_round_v1(coalesce(amount_paid,0),2),
         'invoice amount_paid must equal succeeded payment ledger'
  from invoice_payment_totals
  where public.money_round_v1(succeeded_paid,2)<>public.money_round_v1(coalesce(amount_paid,0),2)

  union all
  select 'service_record',id,'service_subtotal_mismatch',
         public.money_round_v1(line_subtotal,2),public.money_round_v1(coalesce(subtotal,0),2),
         'service record subtotal must equal persisted service lines'
  from service_line_totals
  where public.money_round_v1(line_subtotal,2)<>public.money_round_v1(coalesce(subtotal,0),2)

  union all
  select 'service_record',id,'service_total_mismatch',
         public.money_round_v1(coalesce(subtotal,0)-coalesce(discount_amount,0)+coalesce(tax_amount,0),2),
         public.money_round_v1(coalesce(total_amount,0),2),
         'service total must equal subtotal - discount + tax'
  from service_line_totals
  where public.money_round_v1(coalesce(subtotal,0)-coalesce(discount_amount,0)+coalesce(tax_amount,0),2)
        <>public.money_round_v1(coalesce(total_amount,0),2)

  union all
  select 'appointment',a.id,'appointment_missing_commercial_lines',null,null,
         'current appointment has no persisted commercial line items'
  from public.appointments a
  where a.workspace_id=p_workspace_id
    and a.status::text not in('cancelled','no_show')
    and a.source in('public_booking','staff')
    and coalesce(a.metadata->>'financial_integrity_mode','')<>'legacy_header_only'
    and not exists(
      select 1 from public.appointment_items ai
      where ai.workspace_id=a.workspace_id and ai.appointment_id=a.id
    )

  union all
  select 'work_order',id,'work_order_invoice_line_mismatch',
         public.money_round_v1(work_order_lines,2),public.money_round_v1(invoice_commercial_lines,2),
         'linked invoice commercial lines must equal work-order lines'
  from work_order_invoice_totals
  where invoice_id is not null
    and public.money_round_v1(work_order_lines,2)<>public.money_round_v1(invoice_commercial_lines,2);
$$;
