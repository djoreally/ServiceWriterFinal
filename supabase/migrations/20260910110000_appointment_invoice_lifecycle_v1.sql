create unique index if not exists invoices_appointment_id_unique_v1
on public.invoices ((metadata->>'appointment_id'))
where metadata ? 'appointment_id' and coalesce(metadata->>'appointment_id','') <> '';

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
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item_count integer := 0;
  v_has_oil boolean := false;
  v_status public.invoice_status;
  v_metadata jsonb;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then return null; end if;

  select * into v_settings from public.workspace_settings where workspace_id = v_appt.workspace_id;

  select count(*)::integer,
         coalesce(sum(ai.quantity * ai.unit_price),0),
         coalesce(bool_or(
           lower(coalesce(sc.category,'')) like '%oil%'
           or lower(coalesce(sc.name,'')) like '%oil%'
           or lower(coalesce(ai.description,'')) like '%oil%'
         ),false)
    into v_item_count, v_item_subtotal, v_has_oil
    from public.appointment_items ai
    left join public.service_catalog sc on sc.id = ai.service_catalog_id
   where ai.appointment_id = v_appt.id
     and ai.workspace_id = v_appt.workspace_id;

  if v_item_count = 0 then
    v_tax := greatest(coalesce(nullif(v_appt.metadata->>'tax_amount','')::numeric,0),0);
    v_total := greatest(coalesce(nullif(v_appt.metadata->>'estimated_cost','')::numeric,0),0);
    v_item_subtotal := greatest(v_total - v_tax,0);
  else
    if coalesce(v_settings.waste_oil_fee_enabled,false) and v_has_oil then
      v_waste_fee := greatest(coalesce(v_settings.waste_oil_fee,0),0);
    end if;
    v_tax := greatest(coalesce(nullif(v_appt.metadata->>'tax_amount','')::numeric,0),0);
    v_item_subtotal := round(v_item_subtotal::numeric,2);
    v_total := round((v_item_subtotal + v_waste_fee + v_tax)::numeric,2);
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
      case when v_appt.status::text in ('cancelled','no_show') then 'void'::public.invoice_status else 'issued'::public.invoice_status end,
      round((v_item_subtotal + v_waste_fee)::numeric,2), round(v_tax::numeric,2), v_total,
      0, pg_catalog.now(), v_appt.starts_at, v_appt.created_by,
      pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_invoice')
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
           subtotal = round((v_item_subtotal + v_waste_fee)::numeric,2),
           tax_total = round(v_tax::numeric,2),
           total = v_total,
           due_at = v_appt.starts_at,
           issued_at = coalesce(issued_at,pg_catalog.now()),
           metadata = coalesce(metadata,'{}'::jsonb) || pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_invoice'),
           updated_at = pg_catalog.now()
     where id = v_invoice.id
     returning * into v_invoice;
  end if;

  if v_item_count > 0 then
    delete from public.invoice_lines where invoice_id = v_invoice.id;

    insert into public.invoice_lines(
      workspace_id, invoice_id, description, quantity, unit_price, tax_rate,
      vehicle_id, service_catalog_id, sort_order, metadata
    )
    select ai.workspace_id, v_invoice.id, ai.description, ai.quantity, ai.unit_price, 0,
           coalesce((ai.metadata->>'vehicle_id')::uuid,v_appt.vehicle_id), ai.service_catalog_id,
           ai.sort_order,
           coalesce(ai.metadata,'{}'::jsonb) || pg_catalog.jsonb_build_object(
             'appointment_id',v_appt.id::text,'appointment_item_id',ai.id::text,'source','appointment_item'
           )
      from public.appointment_items ai
     where ai.appointment_id = v_appt.id
       and ai.workspace_id = v_appt.workspace_id
     order by ai.sort_order, ai.created_at;

    if v_waste_fee > 0 then
      insert into public.invoice_lines(
        workspace_id, invoice_id, description, quantity, unit_price, tax_rate,
        vehicle_id, service_catalog_id, sort_order, metadata
      ) values (
        v_appt.workspace_id, v_invoice.id, 'Waste Oil Fee', 1, v_waste_fee, 0,
        v_appt.vehicle_id, null, 9999,
        pg_catalog.jsonb_build_object('appointment_id',v_appt.id::text,'source','appointment_fee','fee_key','waste_oil_fee')
      );
    end if;

    v_metadata := coalesce(v_appt.metadata,'{}'::jsonb) || pg_catalog.jsonb_build_object(
      'estimated_cost', v_total,
      'tax_amount', v_tax,
      'invoice_id', v_invoice.id::text,
      'invoice_number', v_invoice.invoice_number
    );

    if coalesce(v_appt.metadata,'{}'::jsonb) is distinct from v_metadata then
      update public.appointments
         set metadata = v_metadata, updated_at = pg_catalog.now()
       where id = v_appt.id;
    end if;
  end if;

  return v_invoice.id;
end;
$$;

revoke all on function public.sync_appointment_invoice_v1(uuid) from public, anon, authenticated;
grant execute on function public.sync_appointment_invoice_v1(uuid) to service_role;

create or replace function public.appointments_sync_invoice_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_appointment_invoice_v1(new.id);
  return new;
end;
$$;

create or replace function public.appointment_items_sync_invoice_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_appointment_invoice_v1(coalesce(new.appointment_id,old.appointment_id));
  return coalesce(new,old);
end;
$$;

revoke all on function public.appointments_sync_invoice_trigger_v1() from public, anon, authenticated;
revoke all on function public.appointment_items_sync_invoice_trigger_v1() from public, anon, authenticated;

drop trigger if exists appointments_sync_invoice_v1 on public.appointments;
create trigger appointments_sync_invoice_v1
after insert or update of customer_id, vehicle_id, starts_at, status, metadata
on public.appointments
for each row execute function public.appointments_sync_invoice_trigger_v1();

drop trigger if exists appointment_items_sync_invoice_v1 on public.appointment_items;
create trigger appointment_items_sync_invoice_v1
after insert or update or delete on public.appointment_items
for each row execute function public.appointment_items_sync_invoice_trigger_v1();
