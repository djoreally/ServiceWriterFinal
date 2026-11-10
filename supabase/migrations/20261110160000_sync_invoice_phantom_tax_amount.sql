-- Phantom tax_amount column (2026-11-10) -- production break repair.
--
-- The defect: sync_appointment_invoice_v1 references v_appt.tax_amount,
-- a column the production appointments table does not have. Production
-- appointments has 17 columns (verified against information_schema,
-- 2026-11-10): assigned_user_id, confirmation_code, created_at,
-- created_by, customer_id, dispatch_status, ends_at, id, location_id,
-- metadata, notes, source, starts_at, status, updated_at, vehicle_id,
-- workspace_id. PL/pgSQL resolves %rowtype field references at
-- execution time, so the function created cleanly and detonates on
-- every run: ERROR 42703, record "v_appt" has no field "tax_amount".
-- The trigger appointments_sync_invoice_v1 fires this function on
-- INSERT OR UPDATE OF (customer_id, vehicle_id, starts_at, status,
-- metadata), so every appointment status/metadata update in production
-- fails and rolls back -- Start Job included: the update inside
-- start_appointment_job_v1 dies in this trigger. Proven live
-- 2026-11-10 with a rolled-back probe of start_appointment_job_v1
-- (its own body fingerprints identical to the repo definition; the
-- 42703 names this function and this line).
--
-- The phantom head was added by 20261110101500 (Cycle 2, dialog tax):
-- its scratch proof passed because the scratch schema was built from
-- repo definitions, which carry the column; production never did.
--
-- Why removing the head loses nothing: the dialog tax Cycle 2 chased
-- persists durably in appointment METADATA in production, and the
-- surviving chain already reads it first. The Complete dialog displays
-- the tax composed from metadata.tax_amount (the appointment detail
-- query maps tax_amount from metadata.tax_amount); the create/PATCH
-- API folds a body's tax_amount into metadata (the compatibility
-- keys) and never writes a column; the booking-link RPC stamps
-- metadata.client_tax_amount; complete_appointment_v1 reads
-- metadata.tax_amount into the service record's tax_amount at
-- completion, and complete_appointment_closeout_v1 falls back to the
-- same key; this function itself stamps metadata.tax_amount with its
-- computed v_tax on every run. So every tax the dialog can show is
-- the FIRST element of the surviving chain (metadata 'tax_amount'),
-- the booking-link tax is the second ('client_tax_amount'), and the
-- existing invoice's tax_total remains the fallback before 0. The
-- three quote-lock branches still zero v_tax after this assignment,
-- so locked totals are untouched.
--
-- This migration replaces sync_appointment_invoice_v1 ONLY, as a
-- verbatim copy of the current definition
-- (20261110101500_appointment_tax_invoice_sync.sql) with only the
-- v_tax assignment changed. It writes no appointment, invoice, or
-- payment rows: re-syncing invoices already rebuilt against the
-- phantom-era function is a separate owner-approved data step.
--
-- Apply AFTER 20261110101500_appointment_tax_invoice_sync.sql.
-- File-only until applied manually, like the lock migrations.

-- sync_appointment_invoice_v1 drops the phantom appointments.tax_amount
-- column reference. Verbatim copy of the current definition
-- (20261110101500_appointment_tax_invoice_sync.sql) with only the v_tax
-- assignment changed; every other behavior is byte-for-byte unchanged.
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
  v_locked boolean := false;
  v_client_locked boolean := false;
  v_manual_locked boolean := false;
  v_quote numeric := 0;
begin
  select * into v_appt from public.appointments where id=p_appointment_id;
  if not found then return null; end if;

  -- Website quote lock: an appointment pushed from the MOMS website
  -- (source 'moms_website', marked by the staff push RPC) carries the
  -- website's quoted total as its price. That quote is the total: no
  -- workspace fees, no tax on top, no re-pricing from items.
  v_locked:=v_appt.source='moms_website'
    and (coalesce(v_appt.metadata->>'pricing_state','')='website_quote_locked'
         or (v_appt.metadata ? 'website_booking_id'));
  -- Booking-link client quote lock: an appointment created through the
  -- Service Writer booking link (source 'public_booking', marked by
  -- public_booking_book_appointment_v3) carries the total the customer
  -- was shown on the link as its price, under the same rule.
  v_client_locked:=v_appt.source='public_booking'
    and coalesce(v_appt.metadata->>'pricing_state','')='client_quote_locked';
  -- Staff manual quote lock: an appointment staff created in Service
  -- Writer with an explicitly locked custom/flat price (stamped by the
  -- create paths) carries that typed total as its price, under the same
  -- rule. Keyed on pricing_state alone: the state is only ever written
  -- by the staff create paths, never by the website or link channels.
  v_manual_locked:=coalesce(v_appt.metadata->>'pricing_state','')='manual_quote_locked';
  if v_locked or v_client_locked or v_manual_locked then
    v_quote:=public.money_round_v1(greatest(coalesce(
      nullif(v_appt.metadata->>'estimated_cost','')::numeric,
      nullif(v_appt.metadata->>'client_estimated_cost','')::numeric,
      0
    ),0),2);
  end if;

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

  if v_locked or v_client_locked or v_manual_locked then
    v_item_subtotal:=v_quote;
    v_waste_fee:=0;
    v_shop_fee:=0;
    v_surcharge:=0;
    v_tax:=0;
    v_total:=v_quote;
  elsif v_item_count>0 then
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
          'financial_authority','appointment_items_v2',
          'legacy_reconciled',v_legacy_header
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
      when v_locked then 'website_quote_locked'
      when v_client_locked then 'client_quote_locked'
      when v_manual_locked then 'manual_quote_locked'
      when v_legacy_header then 'legacy_reconciled'
      when v_item_count>0 then 'canonical'
      else 'missing_lines'
    end,
    'financial_integrity_mode',case
      when v_locked then 'website_quote_locked'
      when v_client_locked then 'client_quote_locked'
      when v_manual_locked then 'manual_quote_locked'
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

