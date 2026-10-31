-- Booking-link client quote lock (2026-10-31).
--
-- The hole: the canonical public booking create
-- (public_booking_book_appointment_v3) stored estimated_cost = 0 with
-- pricing_state 'pending_canonical_items' and wrote NO priced item,
-- delegating the money to a later, separate client-driven call
-- (public_booking_insert_services_v7). That call re-derives every price
-- server-side, raises on any mismatch (e.g. its dynamic-item name patterns
-- do not match the client's "Additional Oil Quart" line), is
-- all-or-nothing, and is wrapped in a warn-only try/catch in the booking
-- client — so any failure or skip leaves the appointment with zero items
-- forever. sync_appointment_invoice_v1 then hits its no-items fallback and
-- mints a $0 invoice (production: appointment 0829c11e…, INV-97, total
-- $0.00 against a $137.00 quote the customer was shown on the link).
--
-- The fix mirrors the website-push pattern (20261028235900 /
-- 20261029150000) exactly, adapted to the link channel: the link's quote
-- is computed before creation (client_estimated_cost — services, extras
-- and fees as shown to the customer) and is locked AT INSERT, in the same
-- transaction:
--   * metadata.estimated_cost = quote, tax_amount = 0,
--     pricing_state = 'client_quote_locked',
--     client_estimated_cost = quote (unchanged);
--   * ONE appointment_items row at unit_price = quote
--     (price_source 'client_quote', source 'public_booking'), so
--     item-based totals and invoice sync agree with the quote to the cent.
-- A $0 quote keeps the legacy behavior (no item, pending_canonical_items).
-- public_booking_insert_services_v7 is deliberately NOT used for the
-- primary line: it re-prices at service_catalog.labor_price and would
-- break the lock; its existing-items guard makes it a no-op afterwards.
--
-- sync_appointment_invoice_v1 gains the parallel lock branch: a
-- public_booking appointment in pricing_state 'client_quote_locked' is
-- invoiced at its recorded quote — no workspace fees, no tax on top — and
-- the write-back preserves 'client_quote_locked'. The website lock
-- (source 'moms_website') is byte-for-byte unchanged.
--
-- public_booking_record_payment_intent_v3 honors the same lock, so the
-- pay-at-service amount recorded at booking is the quote itself instead
-- of quote + waste fee recomputed from the bundled item.
--
-- This migration replaces functions ONLY. It writes no appointment,
-- invoice, or payment rows: repairing the two appointments already stuck
-- in 'missing_lines' is a separate owner-approved data step.
--
-- Apply AFTER 20261030190000_b1_status_vocabulary_truths.sql. File-only
-- until applied manually, like the push migrations.

-- 1) Public booking creation locks the client quote atomically.
-- Verbatim copy of the current definition
-- (20261009173500_atomic_start_and_public_booking_location.sql) with only
-- the metadata write and the bundled item insert changed.
create or replace function public.public_booking_book_appointment_v3(
  p_booking_slug text,
  p_scheduled_date date,
  p_scheduled_time time without time zone,
  p_duration_minutes integer,
  p_title text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_description text,
  p_notes text,
  p_estimated_cost numeric,
  p_tax_amount numeric,
  p_service_catalog_id uuid,
  p_vehicle_id uuid,
  p_location_address text,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_status text default 'confirmed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_phone_digits text;
  v_vehicle_workspace uuid;
  v_service_workspace uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_appointment_id uuid;
  v_location_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
  v_quote numeric;
  v_service_name text;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if length(trim(coalesce(p_guest_email,''))) < 3 or position('@' in p_guest_email) < 2 then raise exception 'INVALID_EMAIL'; end if;

  v_phone_digits := regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
  if length(v_phone_digits) < 10 then raise exception 'INVALID_PHONE'; end if;

  if nullif(trim(coalesce(p_location_address,'')),'') is null then raise exception 'BOOKING_LOCATION_REQUIRED'; end if;
  if length(trim(p_location_address)) > 1000 then raise exception 'BOOKING_LOCATION_TOO_LONG'; end if;
  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  select c.id into v_customer_id
  from public.customers c
  where c.workspace_id = v_workspace_id
    and lower(c.email::text) = lower(trim(p_guest_email))
    and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10) = right(v_phone_digits,10)
  order by c.created_at
  limit 1;
  if v_customer_id is null then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;

  if p_vehicle_id is null then raise exception 'BOOKING_VEHICLE_REQUIRED'; end if;
  select v.workspace_id into v_vehicle_workspace
  from public.vehicles v
  where v.id = p_vehicle_id and v.customer_id = v_customer_id;
  if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;

  if p_service_catalog_id is not null then
    select s.workspace_id, s.name into v_service_workspace, v_service_name
    from public.service_catalog s
    where s.id = p_service_catalog_id and s.is_active;
    if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if;
  end if;

  select w.timezone into v_timezone from public.workspaces w where w.id = v_workspace_id;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;

  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);

  if v_starts_at < now() + make_interval(hours => coalesce(v_settings.min_lead_time_hours,0))
     or v_starts_at > now() + make_interval(days => coalesce(v_settings.max_advance_days,365))
  then
    raise exception 'DATE_BLOCKED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text,0));
  if exists(
    select 1
    from public.appointments a
    where a.workspace_id = v_workspace_id
      and a.status::text not in ('cancelled','no_show')
      and a.starts_at < v_ends_at
      and a.ends_at > v_starts_at
  ) then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  v_status := case
    when p_status in ('confirmed','scheduled') then 'confirmed'::public.appointment_status
    else 'requested'::public.appointment_status
  end;

  -- The quote the customer was shown on the link (already rounded and
  -- floored when stored as client_estimated_cost below). When it is
  -- positive, it is locked at insert — see the header comment.
  v_quote := round(greatest(coalesce(p_estimated_cost,0),0),2);

  insert into public.locations(
    workspace_id,
    name,
    location_type,
    address_line1,
    latitude,
    longitude
  ) values (
    v_workspace_id,
    'Appointment service location',
    'customer_site'::public.location_type,
    trim(p_location_address),
    p_location_lat,
    p_location_lng
  ) returning id into v_location_id;

  insert into public.appointments(
    workspace_id,
    customer_id,
    vehicle_id,
    location_id,
    status,
    starts_at,
    ends_at,
    source,
    confirmation_code,
    notes,
    metadata
  ) values (
    v_workspace_id,
    v_customer_id,
    p_vehicle_id,
    v_location_id,
    v_status,
    v_starts_at,
    v_ends_at,
    'public_booking',
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    p_notes,
    jsonb_strip_nulls(jsonb_build_object(
      'title', left(coalesce(p_title,'Online booking'),500),
      'guest_name', left(p_guest_name,160),
      'guest_email', lower(trim(p_guest_email)),
      'guest_phone', p_guest_phone,
      'description', p_description,
      'location_address', trim(p_location_address),
      'location_lat', p_location_lat,
      'location_lng', p_location_lng,
      'estimated_cost', case when v_quote > 0 then v_quote else 0 end,
      'tax_amount', 0,
      'service_catalog_id', p_service_catalog_id,
      'pricing_state', case when v_quote > 0 then 'client_quote_locked' else 'pending_canonical_items' end,
      'client_estimated_cost', v_quote,
      'client_tax_amount', round(greatest(coalesce(p_tax_amount,0),0),2)
    ))
  ) returning id into v_appointment_id;

  -- One canonical billable item at the locked client quote, so item-based
  -- totals and invoice sync agree with the quote to the cent. Deliberately
  -- NOT public_booking_insert_services_v7: that path re-prices catalog
  -- services at service_catalog.labor_price and would break the price lock.
  if v_quote > 0 then
    insert into public.appointment_items(
      workspace_id,
      appointment_id,
      service_catalog_id,
      description,
      quantity,
      unit_price,
      is_prepaid,
      sort_order,
      metadata
    ) values (
      v_workspace_id,
      v_appointment_id,
      p_service_catalog_id,
      left(coalesce(nullif(trim(coalesce(v_service_name,'')), ''), nullif(trim(coalesce(p_title,'')), ''), 'Online booking'), 250),
      1,
      v_quote,
      false,
      0,
      jsonb_strip_nulls(jsonb_build_object(
        'vehicle_id', p_vehicle_id,
        'source', 'public_booking',
        'price_source', 'client_quote'
      ))
    );
  end if;

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) from public;
grant execute on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) to anon, authenticated;

-- 2) Invoice sync honors the booking-link client quote lock.
-- Verbatim copy of the current definition
-- (20261029130000_website_quote_price_lock.sql) with only the lock
-- detection, the locked money branch's condition, and the write-back
-- state changed to cover the client lock alongside the website lock.
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
  if v_locked or v_client_locked then
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

  if v_locked or v_client_locked then
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
      when v_legacy_header then 'legacy_reconciled'
      when v_item_count>0 then 'canonical'
      else 'missing_lines'
    end,
    'financial_integrity_mode',case
      when v_locked then 'website_quote_locked'
      when v_client_locked then 'client_quote_locked'
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

-- 3) Pay-at-service payment intent honors the client quote lock.
-- Verbatim copy of the current definition
-- (20261010163100_backfill_missing_prod_functions.sql) with only the
-- appointment read and the amount computation changed: on a
-- client-quote-locked appointment the recorded amount is the quote
-- itself (fees and tax already live inside it), never quote + waste fee
-- recomputed from the bundled item.
CREATE OR REPLACE FUNCTION public.public_booking_record_payment_intent_v3(p_booking_slug text, p_appointment_id uuid, p_amount bigint, p_subtotal bigint, p_tax_amount bigint, p_tax_rate numeric, p_currency text, p_customer_email text, p_customer_phone text, p_customer_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_payment_id uuid;v_source text;v_created_at timestamptz;
 v_email text;v_phone text;v_phone_digits text;v_item_subtotal numeric:=0;v_tax numeric:=0;v_total numeric:=0;
 v_waste_fee numeric:=0;v_has_oil boolean:=false;v_item_count integer:=0;v_settings public.workspace_settings%rowtype;
 v_canonical_subtotal bigint;v_canonical_tax bigint;v_canonical_amount bigint;
 v_pricing_state text;v_client_quote numeric:=0;v_amount_source text;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,a.source,a.created_at,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),
 a.metadata->>'pricing_state',
 greatest(coalesce(nullif(a.metadata->>'estimated_cost','')::numeric,nullif(a.metadata->>'client_estimated_cost','')::numeric,0),0)
 into v_customer_id,v_source,v_created_at,v_email,v_phone,v_pricing_state,v_client_quote
 from public.appointments a where a.id=p_appointment_id and a.workspace_id=v_workspace_id;
 if v_customer_id is null or v_source<>'public_booking' or v_created_at<=now()-interval '30 minutes' then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;

 select * into v_settings from public.workspace_settings where workspace_id=v_workspace_id;
 select count(*)::integer,coalesce(sum(ai.quantity*ai.unit_price),0),
 coalesce(bool_or(lower(coalesce(sc.category,'')) like '%oil%' or lower(coalesce(sc.name,'')) like '%oil%' or lower(coalesce(ai.description,'')) like '%oil%'),false)
 into v_item_count,v_item_subtotal,v_has_oil
 from public.appointment_items ai left join public.service_catalog sc on sc.id=ai.service_catalog_id
 where ai.appointment_id=p_appointment_id and ai.workspace_id=v_workspace_id and public.is_appointment_item_billable_v1(ai);
 if v_item_count=0 then raise exception 'BOOKING_ITEMS_REQUIRED'; end if;
 if v_pricing_state='client_quote_locked' and v_client_quote>0 then
  -- Client quote lock: the amount is the quote the customer was shown at
  -- booking. The bundled item already carries it in full, so no waste
  -- fee or tax is added on top.
  v_tax:=0;v_waste_fee:=0;v_item_subtotal:=round(v_client_quote::numeric,2);v_total:=v_item_subtotal;
  v_canonical_subtotal:=round(v_client_quote*100)::bigint;v_canonical_tax:=0;v_canonical_amount:=v_canonical_subtotal;
  v_amount_source:='client_quote_lock';
 else
  if coalesce(v_settings.waste_oil_fee_enabled,false) and v_has_oil then v_waste_fee:=greatest(coalesce(v_settings.waste_oil_fee,0),0); end if;
  select greatest(coalesce(nullif(a.metadata->>'tax_amount','')::numeric,0),0) into v_tax from public.appointments a where a.id=p_appointment_id;
  v_item_subtotal:=round(v_item_subtotal::numeric,2);v_total:=round((v_item_subtotal+v_waste_fee+v_tax)::numeric,2);
  v_canonical_subtotal:=round((v_item_subtotal+v_waste_fee)*100)::bigint;v_canonical_tax:=round(v_tax*100)::bigint;v_canonical_amount:=round(v_total*100)::bigint;
  v_amount_source:='canonical_appointment_items';
 end if;

 select id into v_payment_id from public.payments where workspace_id=v_workspace_id
 and metadata->>'appointment_id'=p_appointment_id::text and metadata->>'payment_type'='pay_at_service' order by created_at limit 1 for update;
 if v_payment_id is null then
  insert into public.payments(workspace_id,customer_id,status,amount,currency_code,metadata)
  values(v_workspace_id,v_customer_id,'pending',v_total,upper(left(coalesce(p_currency,'USD'),3)),
   jsonb_build_object('appointment_id',p_appointment_id,'payment_type','pay_at_service',
    'subtotal_cents',v_canonical_subtotal,'tax_amount_cents',v_canonical_tax,'tax_rate',p_tax_rate,
    'customer_email',v_email,'customer_name',left(p_customer_name,160),'collected_amount',0,'source','public_booking',
    'amount_source',v_amount_source,'client_amount_cents',p_amount,'client_subtotal_cents',p_subtotal,'client_tax_cents',p_tax_amount))
  returning id into v_payment_id;
 else
  update public.payments set amount=v_total,currency_code=upper(left(coalesce(p_currency,'USD'),3)),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('subtotal_cents',v_canonical_subtotal,'tax_amount_cents',v_canonical_tax,
   'amount_source',v_amount_source,'client_amount_cents',p_amount,'client_subtotal_cents',p_subtotal,'client_tax_cents',p_tax_amount),
   updated_at=now()
  where id=v_payment_id and status='pending';
 end if;
 return v_payment_id;
end $function$;
