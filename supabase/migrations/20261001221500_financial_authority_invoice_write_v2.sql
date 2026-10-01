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
    values(p_workspace_id,v_id,coalesce(nullif(v_metadata->>'shop_fee_description',''),'Shop Supplies Fee'),1,v_shop_fee,0,9002,jsonb_build_object('source','invoice_fee','fee_key','shop_fee'));
  end if;
  if v_surcharge > 0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,sort_order,metadata)
    values(p_workspace_id,v_id,coalesce(nullif(v_metadata->>'surcharge_description',''),'Processing Fee'),1,v_surcharge,0,9003,jsonb_build_object('source','invoice_fee','fee_key','surcharge'));
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

-- Appointment invoice synchronization also obeys the line-ledger authority.
-- Historical header-only jobs are reconstructed as explicit legacy lines and
-- preserve their original tax; current workspace fees are never retroactively applied.
create or replace function public.sync_appointment_invoice_v1(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
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
  v_legacy_header boolean := false;
  v_status public.invoice_status;
  v_metadata jsonb;
  v_surcharge_base numeric := 0;
begin
  select * into v_appt from public.appointments where id=p_appointment_id;
  if not found then return null; end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id=v_appt.workspace_id;

  select * into v_invoice
  from public.invoices
  where workspace_id=v_appt.workspace_id
    and metadata->>'appointment_id'=v_appt.id::text
  order by created_at desc
  limit 1;

  select
    count(*)::integer,
    coalesce(sum(ai.quantity*ai.unit_price),0),
    coalesce(bool_or(
      lower(coalesce(sc.category,'')) like '%oil%'
      or lower(coalesce(sc.name,'')) like '%oil%'
      or lower(coalesce(ai.description,'')) like '%oil%'
    ),false),
    coalesce(bool_or(coalesce(ai.metadata->>'source','')='legacy_header_reconciliation'),false)
  into v_item_count,v_item_subtotal,v_has_oil,v_legacy_header
  from public.appointment_items ai
  left join public.service_catalog sc on sc.id=ai.service_catalog_id
  where ai.appointment_id=v_appt.id
    and ai.workspace_id=v_appt.workspace_id
    and public.is_appointment_item_billable_v1(ai);

  v_item_subtotal:=public.money_round_v1(greatest(v_item_subtotal,0),2);
  v_tax:=public.money_round_v1(greatest(coalesce(
    nullif(v_appt.metadata->>'tax_amount','')::numeric,
    nullif(v_appt.metadata->>'client_tax_amount','')::numeric,
    case when found then v_invoice.tax_total else 0 end,
    0
  ),0),2);

  if v_item_count>0 then
    if not v_legacy_header then
      if coalesce(v_settings.waste_oil_fee_enabled,false) and v_has_oil then
        v_waste_fee:=public.money_round_v1(greatest(coalesce(v_settings.waste_oil_fee,0),0),2);
      end if;

      if coalesce(v_settings.shop_fee_enabled,false) and greatest(coalesce(v_settings.shop_fee_value,0),0)>0 then
        v_shop_fee:=case
          when lower(coalesce(v_settings.shop_fee_type,'fixed'))='percentage'
            then public.money_round_v1(v_item_subtotal*greatest(v_settings.shop_fee_value,0)/100,2)
          else public.money_round_v1(greatest(v_settings.shop_fee_value,0),2)
        end;
      end if;

      v_surcharge_base:=public.money_round_v1(v_item_subtotal+v_waste_fee+v_shop_fee,2);
      if coalesce(v_settings.surcharge_enabled,false) and greatest(coalesce(v_settings.surcharge_value,0),0)>0 then
        v_surcharge:=case
          when lower(coalesce(v_settings.surcharge_type,'fixed'))='percentage'
            then public.money_round_v1(v_surcharge_base*greatest(v_settings.surcharge_value,0)/100,2)
          else public.money_round_v1(greatest(v_settings.surcharge_value,0),2)
        end;
      end if;
    end if;

    v_total:=public.money_round_v1(v_item_subtotal+v_waste_fee+v_shop_fee+v_surcharge+v_tax,2);
  else
    -- Non-canonical legacy/import fallback. Treat estimated_cost as service
    -- subtotal when tax is separately present; never subtract tax from it.
    v_item_subtotal:=public.money_round_v1(greatest(coalesce(
      nullif(v_appt.metadata->>'estimated_cost','')::numeric,
      case when found then v_invoice.subtotal else 0 end,
      0
    ),0),2);
    v_total:=public.money_round_v1(v_item_subtotal+v_tax,2);
  end if;

  if v_invoice.id is null then
    insert into public.invoices(
      workspace_id,customer_id,vehicle_id,status,subtotal,tax_total,total,
      amount_paid,issued_at,due_at,created_by,metadata
    ) values (
      v_appt.workspace_id,v_appt.customer_id,v_appt.vehicle_id,
      case when v_appt.status::text in('cancelled','no_show')
        then 'void'::public.invoice_status else 'issued'::public.invoice_status end,
      public.money_round_v1(v_item_subtotal+v_waste_fee+v_shop_fee+v_surcharge,2),
      v_tax,v_total,0,pg_catalog.now(),v_appt.starts_at,v_appt.created_by,
      pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_invoice')
    ) returning * into v_invoice;
  else
    if v_appt.status::text in('cancelled','no_show') and coalesce(v_invoice.amount_paid,0)=0 then
      v_status:='void'::public.invoice_status;
    elsif coalesce(v_invoice.amount_paid,0)>=v_total and v_total>0 then
      v_status:='paid'::public.invoice_status;
    elsif coalesce(v_invoice.amount_paid,0)>0 then
      v_status:='partially_paid'::public.invoice_status;
    else
      v_status:='issued'::public.invoice_status;
    end if;

    if coalesce(v_invoice.amount_paid,0)>v_total+0.009 then
      raise exception 'Financial integrity violation: synchronized total % is below amount already paid % for appointment %',
        v_total,v_invoice.amount_paid,v_appt.id;
    end if;

    update public.invoices
    set customer_id=v_appt.customer_id,
        vehicle_id=v_appt.vehicle_id,
        status=v_status,
        subtotal=public.money_round_v1(v_item_subtotal+v_waste_fee+v_shop_fee+v_surcharge,2),
        tax_total=v_tax,
        total=v_total,
        due_at=v_appt.starts_at,
        issued_at=coalesce(issued_at,pg_catalog.now()),
        metadata=coalesce(metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'appointment_id',v_appt.id::text,
          'source',case when v_legacy_header then 'legacy_appointment_reconciliation' else 'appointment_invoice' end,
          'financial_authority','appointment_items_v2'
        ),
        updated_at=pg_catalog.now()
    where id=v_invoice.id
    returning * into v_invoice;
  end if;

  delete from public.invoice_lines
  where workspace_id=v_appt.workspace_id and invoice_id=v_invoice.id;

  if v_item_count>0 then
    insert into public.invoice_lines(
      workspace_id,invoice_id,description,quantity,unit_price,tax_rate,
      vehicle_id,service_catalog_id,sort_order,metadata
    )
    select
      ai.workspace_id,v_invoice.id,ai.description,ai.quantity,ai.unit_price,0,
      coalesce(
        case when coalesce(ai.metadata->>'vehicle_id','') ~* '^[0-9a-f-]{36}$'
          then (ai.metadata->>'vehicle_id')::uuid else null end,
        v_appt.vehicle_id
      ),
      ai.service_catalog_id,ai.sort_order,
      coalesce(ai.metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'appointment_id',v_appt.id::text,
        'appointment_item_id',ai.id::text,
        'source',case when v_legacy_header then 'legacy_appointment_line' else 'appointment_item' end
      )
    from public.appointment_items ai
    where ai.appointment_id=v_appt.id
      and ai.workspace_id=v_appt.workspace_id
      and public.is_appointment_item_billable_v1(ai)
    order by ai.sort_order,ai.created_at;

    if v_waste_fee>0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,'Waste Oil Disposal Fee',1,v_waste_fee,0,v_appt.vehicle_id,null,9001,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','waste_oil_fee'));
    end if;
    if v_shop_fee>0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,coalesce(nullif(v_settings.shop_fee_description,''),'Shop Supplies Fee'),1,v_shop_fee,0,v_appt.vehicle_id,null,9002,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','shop_fee'));
    end if;
    if v_surcharge>0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      values(v_appt.workspace_id,v_invoice.id,coalesce(nullif(v_settings.surcharge_description,''),'Card Processing Fee'),1,v_surcharge,0,v_appt.vehicle_id,null,9003,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','surcharge'));
    end if;
  end if;

  v_metadata:=coalesce(v_appt.metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'estimated_cost',v_total,
    'tax_amount',v_tax,
    'invoice_id',v_invoice.id::text,
    'invoice_number',v_invoice.invoice_number,
    'pricing_state',case
      when v_legacy_header then 'legacy_reconciled'
      when v_item_count>0 then 'canonical'
      else 'missing_lines'
    end,
    'financial_integrity_mode',case
      when v_legacy_header then 'legacy_reconciled'
      when v_item_count>0 then 'canonical'
      else 'missing_lines'
    end
  );
  if coalesce(v_appt.metadata,'{}'::jsonb) is distinct from v_metadata then
    update public.appointments
    set metadata=v_metadata,updated_at=pg_catalog.now()
    where id=v_appt.id;
  end if;

  return v_invoice.id;
end;
$$;

-- Reconstruct the two known completed staff jobs from their own historical
-- service subtotal. The trigger above preserves stored tax and suppresses
-- current fee settings for these explicit legacy lines.
insert into public.appointment_items(
  workspace_id,appointment_id,service_catalog_id,item_type,description,
  quantity,unit_price,is_prepaid,added_at_service,sort_order,metadata
)
select
  a.workspace_id,a.id,
  case
    when coalesce(a.metadata->>'service_catalog_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (a.metadata->>'service_catalog_id')::uuid
    else null
  end,
  'service',
  coalesce(nullif(a.metadata->>'title',''),'Legacy service amount'),
  1,
  greatest(coalesce(nullif(a.metadata->>'estimated_cost','')::numeric,0),0),
  false,false,0,
  pg_catalog.jsonb_build_object(
    'source','legacy_header_reconciliation',
    'price_source','historical_appointment_header',
    'reconciled_at',pg_catalog.now()
  )
from public.appointments a
where a.id in(
  '2e724e69-0f79-4f3c-9032-80249d081528'::uuid,
  '47b8f4cf-2eab-4d2a-86e1-eee1bd5a9bb2'::uuid
)
  and a.status::text='completed'
  and greatest(coalesce(nullif(a.metadata->>'estimated_cost','')::numeric,0),0)>0
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
  work_order_line_totals as (
    select wo.id,
           coalesce(sum(woi.quantity*woi.unit_price),0) work_order_lines
    from public.work_orders wo
    left join public.work_order_items woi
      on woi.workspace_id=wo.workspace_id and woi.work_order_id=wo.id
    where wo.workspace_id=p_workspace_id
    group by wo.id
  ),
  work_order_invoice_totals as (
    select wt.id,
           wt.work_order_lines,
           i.id invoice_id,
           coalesce(sum(il.quantity*il.unit_price)
             filter(where coalesce(il.metadata->>'source','')='invoice_commercial_line'),0) invoice_commercial_lines
    from work_order_line_totals wt
    join public.invoices i
      on i.workspace_id=p_workspace_id and i.work_order_id=wt.id and i.status::text<>'void'
    left join public.invoice_lines il
      on il.workspace_id=i.workspace_id and il.invoice_id=i.id
    group by wt.id,wt.work_order_lines,i.id
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
