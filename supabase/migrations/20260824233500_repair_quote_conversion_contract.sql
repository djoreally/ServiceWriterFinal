-- Repair quote -> service-record conversion before any Final quote conversion occurs.
-- Final main had zero quote_conversions when this forward-only function replacement was applied.

create or replace function public.convert_quote_to_service_record_v1(
  p_workspace_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_created_by uuid,
  p_service_date date default current_date,
  p_technician_id uuid default null,
  p_appointment_id uuid default null,
  p_work_order_id uuid default null,
  p_internal_notes text default null,
  p_expected_quote_updated_at timestamptz default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_item record;
  v_existing public.quote_conversions%rowtype;
  v_conversion_id uuid;
  v_service_record_id uuid;
  v_currency text;
  v_item_count integer := 0;
  v_discount numeric := 0;
begin
  if auth.uid() is null or auth.uid() <> p_created_by then
    raise exception 'quote_conversion_forbidden';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role::text = any (array['owner','admin','manager','service_advisor'])
  ) then
    raise exception 'quote_conversion_forbidden';
  end if;

  select * into v_existing
  from public.quote_conversions
  where workspace_id = p_workspace_id
    and quote_id = p_quote_id
    and idempotency_key = p_idempotency_key
  order by created_at desc
  limit 1;

  if v_existing.id is not null and v_existing.status = 'converted' then
    return jsonb_build_object(
      'conversion_id', v_existing.id,
      'quote_id', v_existing.quote_id,
      'service_record_id', v_existing.service_record_id,
      'status', 'converted',
      'replayed', true
    );
  end if;

  select * into v_quote
  from public.quotes
  where id = p_quote_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'quote_not_found'; end if;
  if v_quote.status in ('converted','declined','expired') then
    raise exception 'quote_status_not_convertible';
  end if;
  if p_expected_quote_updated_at is not null and v_quote.updated_at <> p_expected_quote_updated_at then
    raise exception 'quote_changed_refresh_required';
  end if;

  select * into v_existing
  from public.quote_conversions
  where workspace_id = p_workspace_id and quote_id = p_quote_id and status = 'converted'
  limit 1;
  if v_existing.id is not null then raise exception 'quote_already_converted'; end if;

  if p_technician_id is not null and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_technician_id and wm.is_active
  ) then
    raise exception 'quote_conversion_forbidden';
  end if;

  if p_appointment_id is not null and not exists (
    select 1 from public.appointments a where a.workspace_id = p_workspace_id and a.id = p_appointment_id
  ) then raise exception 'quote_not_found'; end if;

  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders wo where wo.workspace_id = p_workspace_id and wo.id = p_work_order_id
  ) then raise exception 'quote_not_found'; end if;

  select coalesce(w.currency_code,'USD') into v_currency
  from public.workspaces w where w.id = p_workspace_id;

  begin
    v_discount := greatest(coalesce(nullif(v_quote.metadata->>'discount_amount','')::numeric,0),0);
  exception when others then
    v_discount := 0;
  end;

  insert into public.service_records (
    workspace_id, quote_id, appointment_id, work_order_id, technician_id,
    customer_id, vehicle_id, status, work_performed, internal_notes, metadata,
    subtotal, tax_amount, discount_amount, total_amount, currency_code
  ) values (
    p_workspace_id, p_quote_id, p_appointment_id,
    coalesce(p_work_order_id, v_quote.work_order_id), p_technician_id,
    v_quote.customer_id, v_quote.vehicle_id, 'draft',
    coalesce(nullif(v_quote.metadata->>'description',''), 'Converted quote ' || p_quote_id::text),
    p_internal_notes,
    jsonb_build_object(
      'source','quote_conversion','quote_id',p_quote_id,'service_date',p_service_date,
      'quote_status',v_quote.status,'source_quote_updated_at',v_quote.updated_at
    ),
    greatest(coalesce(v_quote.subtotal,0),0),
    greatest(coalesce(v_quote.tax_total,0),0),
    v_discount,
    greatest(coalesce(v_quote.total,0),0),
    v_currency
  ) returning id into v_service_record_id;

  for v_item in
    select * from public.quote_items
    where quote_id = p_quote_id and workspace_id = p_workspace_id
    order by created_at, id
  loop
    insert into public.service_record_line_items (
      workspace_id, service_record_id, source_quote_id, source_quote_item_id,
      item_type, description, inventory_item_id, quantity, unit_price, total_price, sort_order
    ) values (
      p_workspace_id, v_service_record_id, p_quote_id, v_item.id,
      'part', v_item.description, v_item.inventory_item_id,
      greatest(coalesce(v_item.quantity,1),0.001),
      greatest(coalesce(v_item.unit_price,0),0),
      round(greatest(coalesce(v_item.quantity,1),0.001) * greatest(coalesce(v_item.unit_price,0),0),2),
      v_item_count
    );
    v_item_count := v_item_count + 1;
  end loop;

  insert into public.quote_conversions (
    workspace_id, quote_id, service_record_id, idempotency_key, status,
    source_quote_snapshot, source_items_snapshot, conversion_options,
    created_by, completed_at
  ) values (
    p_workspace_id, p_quote_id, v_service_record_id, p_idempotency_key, 'converted',
    to_jsonb(v_quote),
    coalesce((select jsonb_agg(to_jsonb(qi) order by qi.created_at, qi.id)
      from public.quote_items qi where qi.quote_id = p_quote_id and qi.workspace_id = p_workspace_id),'[]'::jsonb),
    jsonb_build_object('service_date',p_service_date,'technician_id',p_technician_id,'appointment_id',p_appointment_id,'work_order_id',coalesce(p_work_order_id,v_quote.work_order_id)),
    auth.uid(), now()
  ) returning id into v_conversion_id;

  update public.quotes set status = 'converted', updated_at = now()
  where id = p_quote_id and workspace_id = p_workspace_id;

  return jsonb_build_object(
    'conversion_id',v_conversion_id,'quote_id',p_quote_id,'service_record_id',v_service_record_id,
    'status','converted','line_item_count',v_item_count,
    'totals',jsonb_build_object('subtotal',v_quote.subtotal,'tax_amount',v_quote.tax_total,'discount_amount',v_discount,'total_amount',v_quote.total,'currency_code',v_currency)
  );
exception when unique_violation then
  select * into v_existing from public.quote_conversions
  where workspace_id = p_workspace_id and quote_id = p_quote_id and status = 'converted' limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('conversion_id',v_existing.id,'quote_id',p_quote_id,'service_record_id',v_existing.service_record_id,'status','converted','replayed',true);
  end if;
  raise;
end;
$$;

revoke all on function public.convert_quote_to_service_record_v1(uuid,uuid,text,uuid,date,uuid,uuid,uuid,text,timestamptz) from public, anon;
grant execute on function public.convert_quote_to_service_record_v1(uuid,uuid,text,uuid,date,uuid,uuid,uuid,text,timestamptz) to authenticated, service_role;
