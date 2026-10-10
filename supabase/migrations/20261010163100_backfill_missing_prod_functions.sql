-- Migration: Backfill 32 functions found in production but missing from repo migrations
-- Verified against live production (rjfbrfognxqkyhdrpibx) on 2026-10-10
-- Function bodies are the actual production definitions.

-- === apply_appointment_card_fee_v1 ===
CREATE OR REPLACE FUNCTION public.apply_appointment_card_fee_v1(p_workspace_id uuid, p_appointment_id uuid, p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.workspace_settings%rowtype; inv public.invoices%rowtype; fee numeric:=0; base numeric:=0;
begin
  select * into s from public.workspace_settings where workspace_id=p_workspace_id;
  select * into inv from public.invoices where workspace_id=p_workspace_id and id=p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  delete from public.invoice_lines where workspace_id=p_workspace_id and invoice_id=p_invoice_id and metadata->>'fee_key'='card_processing_fee';
  base:=round(coalesce(inv.total,0),2);
  if coalesce(s.surcharge_enabled,false) and coalesce(s.surcharge_value,0)>0 then
    fee:=case when s.surcharge_type='fixed' then round(s.surcharge_value,2)
      else round(base*(s.surcharge_value/100.0),2) end;
  end if;
  if fee>0 then
    insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
    select p_workspace_id,p_invoice_id,coalesce(nullif(s.surcharge_description,''),'Card Processing Fee'),1,fee,0,a.vehicle_id,null,10000,
      jsonb_build_object('appointment_id',p_appointment_id::text,'source','appointment_fee','fee_key','card_processing_fee','surcharge_type',s.surcharge_type,'surcharge_value',s.surcharge_value)
    from public.appointments a where a.workspace_id=p_workspace_id and a.id=p_appointment_id;
    update public.invoices set subtotal=round(subtotal+fee,2),total=round(total+fee,2),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('card_fee_amount',fee,'card_fee_cents',round(fee*100)::integer,'pre_card_fee_total',base),updated_at=now()
    where workspace_id=p_workspace_id and id=p_invoice_id;
  else
    update public.invoices set metadata=(coalesce(metadata,'{}'::jsonb)-'card_fee_amount'-'card_fee_cents')||jsonb_build_object('pre_card_fee_total',base),updated_at=now()
    where workspace_id=p_workspace_id and id=p_invoice_id;
  end if;
  return fee;
end $function$;

-- === assert_appointment_ready_for_closeout_v1 ===
CREATE OR REPLACE FUNCTION public.assert_appointment_ready_for_closeout_v1(p_workspace_id uuid, p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pending_inspections integer:=0; v_pending_recommendations integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if not exists(select 1 from public.appointments where workspace_id=p_workspace_id and id=p_appointment_id) then raise exception 'Appointment not found'; end if;

  select count(*) into v_pending_inspections from (
    select distinct sc.inspection_template_id template_id,
      coalesce(nullif(ai.metadata->>'vehicle_id','')::uuid,a.vehicle_id) vehicle_id
    from public.appointments a
    join public.appointment_items ai on ai.workspace_id=a.workspace_id and ai.appointment_id=a.id
    join public.service_catalog sc on sc.workspace_id=ai.workspace_id and sc.id=ai.service_catalog_id
    where a.workspace_id=p_workspace_id and a.id=p_appointment_id and sc.inspection_template_id is not null
  ) required
  where not exists(
    select 1 from public.service_inspections si
    where si.workspace_id=p_workspace_id and si.appointment_id=p_appointment_id
      and si.template_id=required.template_id and si.vehicle_id is not distinct from required.vehicle_id
      and si.status='completed'
  );
  if v_pending_inspections>0 then
    raise exception 'INSPECTION_REQUIRED: % required vehicle inspection(s) remain incomplete',v_pending_inspections;
  end if;

  select count(*) into v_pending_recommendations from public.service_recommendations r
   where r.workspace_id=p_workspace_id and r.appointment_id=p_appointment_id and r.status in ('pending','approved');
  if v_pending_recommendations>0 then
    raise exception 'RECOMMENDATION_REQUIRED: % recommendation(s) remain pending or approved work remains unresolved',v_pending_recommendations;
  end if;
end $function$;

-- === assert_appointment_vehicle_attribution_v1 ===
CREATE OR REPLACE FUNCTION public.assert_appointment_vehicle_attribution_v1(p_workspace_id uuid, p_appointment_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_default_vehicle uuid;
  v_customer_id uuid;
  v_vehicle_ids uuid[];
  v_vehicle_count integer;
  v_unattributed_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;

  select vehicle_id,customer_id into v_default_vehicle,v_customer_id
  from public.appointments
  where workspace_id=p_workspace_id and id=p_appointment_id;
  if not found then raise exception 'Appointment not found'; end if;

  if exists(
    select 1 from public.appointment_items ai
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and nullif(ai.metadata->>'vehicle_id','') is not null
      and (ai.metadata->>'vehicle_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Appointment item contains invalid vehicle attribution';
  end if;

  if exists(
    select 1
    from public.appointment_items ai
    left join public.vehicles v
      on v.workspace_id=p_workspace_id
     and v.id=(nullif(ai.metadata->>'vehicle_id',''))::uuid
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and nullif(ai.metadata->>'vehicle_id','') is not null
      and (
        v.id is null
        or (v_customer_id is not null and v.customer_id is distinct from v_customer_id)
      )
  ) then
    raise exception 'Appointment item vehicle does not belong to this appointment customer/workspace';
  end if;

  select
    array_agg(distinct coalesce((nullif(ai.metadata->>'vehicle_id',''))::uuid,v_default_vehicle)),
    count(*) filter(where nullif(ai.metadata->>'vehicle_id','') is null)
  into v_vehicle_ids,v_unattributed_count
  from public.appointment_items ai
  where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id;

  v_vehicle_count:=coalesce(array_length(v_vehicle_ids,1),0);
  if v_vehicle_count=0 and v_default_vehicle is not null then
    v_vehicle_ids:=array[v_default_vehicle];
    v_vehicle_count:=1;
  end if;

  if v_vehicle_ids is null or v_vehicle_count=0 then
    raise exception 'Appointment has no vehicle attribution';
  end if;

  if v_vehicle_count>1 and coalesce(v_unattributed_count,0)>0 then
    raise exception 'Multi-vehicle appointment requires explicit vehicle attribution on every appointment item';
  end if;

  return v_vehicle_ids;
end $function$;

-- === cancel_customer_appointment_v2 ===
CREATE OR REPLACE FUNCTION public.cancel_customer_appointment_v2(p_appointment_id uuid, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_a public.appointments%rowtype;v_s public.workspace_settings%rowtype;v_now timestamptz:=now();
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.* into v_a from public.appointments a where a.id=p_appointment_id and exists(
 select 1 from public.customer_users cu where cu.user_id=v_uid and cu.customer_id=a.customer_id and cu.workspace_id=a.workspace_id) for update;
 if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 if v_a.status in('cancelled','completed','no_show') then return jsonb_build_object('success',false,'message','This appointment can no longer be cancelled.'); end if;
 select * into v_s from public.workspace_settings where workspace_id=v_a.workspace_id;
 if coalesce(v_s.allow_cancellation,true)=false then return jsonb_build_object('success',false,'message','Online cancellation is disabled for this shop.'); end if;
 if v_a.starts_at<=v_now+make_interval(hours=>coalesce(v_s.cancellation_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Cancellations must be made at least %s hours before the appointment.',coalesce(v_s.cancellation_window_hours,24))); end if;
 update public.appointments set status='cancelled',metadata=(coalesce(metadata,'{}'::jsonb)-'management_token')||jsonb_build_object('cancellation_reason',nullif(trim(coalesce(p_cancellation_reason,'')),''),'cancelled_at',v_now,'cancelled_by','customer_portal'),updated_at=v_now where id=v_a.id;
 return jsonb_build_object('success',true,'appointment_id',v_a.id,'status','cancelled');
end $function$;

-- === enforce_workspace_technician_entitlement_v1 ===
CREATE OR REPLACE FUNCTION public.enforce_workspace_technician_entitlement_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  billing public.workspace_billing%rowtype;
  active_technicians integer;
  allowed_technicians integer;
begin
  if new.role::text <> 'technician' or new.is_active is not true then
    return new;
  end if;

  select * into billing
  from public.workspace_billing
  where workspace_id = new.workspace_id;

  if not found then
    raise exception 'Workspace billing is not configured' using errcode = 'P0001';
  end if;

  allowed_technicians := case billing.plan_tier
    when 'pro' then 3 + billing.additional_technician_quantity
    when 'fleet' then 5 + billing.additional_technician_quantity
    else 0
  end;

  select count(*)::integer into active_technicians
  from public.workspace_members wm
  where wm.workspace_id = new.workspace_id
    and wm.role::text = 'technician'
    and wm.is_active = true
    and (tg_op = 'INSERT' or wm.user_id <> old.user_id);

  if active_technicians + 1 > allowed_technicians then
    raise exception 'Technician seat limit reached for this workspace plan' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

-- === enqueue_service_recommendation_lifecycle_v1 ===
CREATE OR REPLACE FUNCTION public.enqueue_service_recommendation_lifecycle_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_appointment public.appointments;
  v_customer public.customers;
  v_vehicle public.vehicles;
  v_workspace public.workspaces;
  v_event_key text;
  v_idempotency_key text;
  v_variables jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_key := 'technician_and_live_service_sequence.additional_work_recommended';
    v_idempotency_key := 'service-recommendation:' || new.id::text || ':additional-work-recommended';
  elsif new.status in ('approved', 'declined')
    and old.status is distinct from new.status then
    v_event_key := 'technician_and_live_service_sequence.authorization_received';
    v_idempotency_key := 'service-recommendation:' || new.id::text || ':authorization-received:' || new.status;
  else
    return new;
  end if;

  select * into v_appointment
  from public.appointments
  where workspace_id = new.workspace_id and id = new.appointment_id;

  select * into v_customer
  from public.customers
  where workspace_id = new.workspace_id and id = v_appointment.customer_id;

  -- A missing email is not a failed authorization transaction.  The durable
  -- recommendation remains visible in-app and can be acted on by staff.
  if nullif(trim(v_customer.email::text), '') is null then
    return new;
  end if;

  select * into v_vehicle
  from public.vehicles
  where workspace_id = new.workspace_id and id = new.vehicle_id;

  select * into v_workspace
  from public.workspaces
  where id = new.workspace_id;

  v_variables := jsonb_build_object(
    'business.name', v_workspace.name,
    'customer.first_name', v_customer.first_name,
    'customer.full_name', trim(concat_ws(' ', v_customer.first_name, v_customer.last_name)),
    'appointment.confirmation_code', coalesce(v_appointment.confirmation_code, upper(left(v_appointment.id::text, 8))),
    'vehicle.year', coalesce(v_vehicle.year::text, ''),
    'vehicle.make', coalesce(v_vehicle.make, ''),
    'vehicle.model', coalesce(v_vehicle.model, ''),
    'vehicle.description', trim(concat_ws(' ', v_vehicle.year::text, v_vehicle.make, v_vehicle.model)),
    'authorization.service', new.description,
    'authorization.amount', to_char(coalesce(new.price, 0), 'FM$999,999,990.00'),
    'authorization.decision', new.status
  );

  insert into public.lifecycle_event_outbox(
    workspace_id,
    event_key,
    entity_type,
    entity_id,
    recipient_email,
    recipient_role,
    payload,
    idempotency_key
  ) values (
    new.workspace_id,
    v_event_key,
    'appointment',
    new.appointment_id,
    lower(trim(v_customer.email::text))::citext,
    'customer',
    jsonb_build_object(
      'variables', v_variables,
      'metadata', jsonb_build_object(
        'appointmentId', new.appointment_id,
        'vehicleId', new.vehicle_id,
        'inspectionId', new.inspection_id,
        'inspectionResultId', new.inspection_result_id,
        'recommendationId', new.id
      ),
      'customerId', v_customer.id
    ),
    v_idempotency_key
  )
  on conflict (workspace_id, idempotency_key) do nothing;

  return new;
end;
$function$;

-- === get_appointment_service_recommendations_v1 ===
CREATE OR REPLACE FUNCTION public.get_appointment_service_recommendations_v1(p_appointment_id uuid)
 RETURNS TABLE(id uuid, appointment_id uuid, vehicle_id uuid, inspection_id uuid, inspection_result_id uuid, service_catalog_id uuid, appointment_item_id uuid, description text, technician_notes text, price numeric, status text, decided_at timestamp with time zone, vehicle_description text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recommendation_appointment public.appointments;
begin
  select * into recommendation_appointment
  from public.appointments a
  where a.id = p_appointment_id;

  if recommendation_appointment.id is null then
    raise exception 'appointment not found';
  end if;
  if not public.is_workspace_staff(recommendation_appointment.workspace_id)
    and not public.is_customer_for_workspace(
      recommendation_appointment.workspace_id,
      recommendation_appointment.customer_id
    ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    r.id,
    r.appointment_id,
    r.vehicle_id,
    r.inspection_id,
    r.inspection_result_id,
    r.service_catalog_id,
    r.appointment_item_id,
    r.description,
    r.technician_notes,
    r.price,
    r.status,
    r.decided_at,
    trim(concat_ws(' ', v.year::text, v.make, v.model)) as vehicle_description
  from public.service_recommendations r
  join public.vehicles v
    on v.workspace_id = r.workspace_id and v.id = r.vehicle_id
  where r.workspace_id = recommendation_appointment.workspace_id
    and r.appointment_id = recommendation_appointment.id
  order by r.created_at, r.id;
end;
$function$;

-- === get_public_blocked_dates_v3 ===
CREATE OR REPLACE FUNCTION public.get_public_blocked_dates_v3(p_booking_slug text)
 RETURNS TABLE(blocked_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select b.blocked_date
 from public.workspace_settings ws join public.workspaces w on w.id=ws.workspace_id
 join public.workspace_blackout_dates b on b.workspace_id=ws.workspace_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled
 and b.blocked_date >= current_date
 order by b.blocked_date
$function$;

-- === get_public_booked_slots_v2 ===
CREATE OR REPLACE FUNCTION public.get_public_booked_slots_v2(p_booking_slug text, p_booking_date date)
 RETURNS TABLE(scheduled_time time without time zone, duration_minutes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (a.starts_at at time zone w.timezone)::time,greatest(1,ceil(extract(epoch from(a.ends_at-a.starts_at))/60.0)::integer)
 from public.appointments a join public.workspaces w on w.id=a.workspace_id join public.workspace_settings ws on ws.workspace_id=w.id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled
 and (a.starts_at at time zone w.timezone)::date=p_booking_date and a.status::text not in('cancelled','no_show') order by a.starts_at
$function$;

-- === get_public_booking_settings_v2 ===
CREATE OR REPLACE FUNCTION public.get_public_booking_settings_v2(p_booking_slug text)
 RETURNS TABLE(waste_oil_fee_enabled boolean, waste_oil_fee numeric, shop_fee_enabled boolean, shop_fee_type text, shop_fee_value numeric, shop_fee_description text, surcharge_enabled boolean, surcharge_type text, surcharge_value numeric, surcharge_description text, payment_provider text, payments_enabled boolean, oil_price_per_quart numeric, weather_guard_enabled boolean, weather_guard_settings jsonb, day_hours jsonb, service_verticals text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select ws.waste_oil_fee_enabled,ws.waste_oil_fee,ws.shop_fee_enabled,ws.shop_fee_type,ws.shop_fee_value,ws.shop_fee_description,
 ws.surcharge_enabled,ws.surcharge_type,ws.surcharge_value,ws.surcharge_description,ws.payment_provider,
 coalesce((ws.operational_settings->>'stripe_charges_enabled')::boolean,false) and nullif(ws.operational_settings->>'stripe_account_id','') is not null,
 ws.oil_price_per_quart,coalesce((ws.operational_settings->>'weather_guard_enabled')::boolean,false),ws.operational_settings->'weather_guard_settings',ws.day_hours,
 case when jsonb_typeof(ws.operational_settings->'service_verticals')='array' then array(select jsonb_array_elements_text(ws.operational_settings->'service_verticals')) else array[]::text[] end
 from public.workspace_settings ws join public.workspaces w on w.id=ws.workspace_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled
$function$;

-- === get_public_service_catalog_v3 ===
CREATE OR REPLACE FUNCTION public.get_public_service_catalog_v3(p_booking_slug text)
 RETURNS TABLE(id uuid, name text, description text, category text, category_id text, default_price numeric, estimated_duration integer, is_upsell boolean, service_vertical text, service_intent text, pricing_mode text, booking_requirements text[], requires_tire_quantity boolean, requires_fitment_lookup boolean, requires_inventory_selection boolean, allows_manual_fitment boolean, configuration_schema_version integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select sc.id,sc.name,sc.description,sc.category,
 coalesce(nullif(sc.metadata->>'category_id',''),lower(regexp_replace(coalesce(sc.category,'service'),'[^a-zA-Z0-9]+','_','g'))),
 sc.labor_price,coalesce(sc.estimated_minutes,30),coalesce((sc.metadata->>'is_upsell')::boolean,false),
 coalesce(nullif(sc.metadata->>'service_vertical',''),'automotive'),coalesce(nullif(sc.metadata->>'service_intent',''),lower(regexp_replace(sc.name,'[^a-zA-Z0-9]+','_','g'))),
 coalesce(nullif(sc.metadata->>'pricing_mode',''),'fixed'),
 case when jsonb_typeof(sc.metadata->'booking_requirements')='array' then array(select jsonb_array_elements_text(sc.metadata->'booking_requirements')) else array[]::text[] end,
 coalesce((sc.metadata->>'requires_tire_quantity')::boolean,false),coalesce((sc.metadata->>'requires_fitment_lookup')::boolean,false),
 coalesce((sc.metadata->>'requires_inventory_selection')::boolean,false),coalesce((sc.metadata->>'allows_manual_fitment')::boolean,true),
 coalesce((sc.metadata->>'configuration_schema_version')::integer,1)
 from public.service_catalog sc join public.workspace_settings ws on ws.workspace_id=sc.workspace_id join public.workspaces w on w.id=sc.workspace_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled and sc.is_active
 order by coalesce((sc.metadata->>'sort_order')::integer,9999),sc.name
$function$;

-- === get_public_service_packages_v2 ===
CREATE OR REPLACE FUNCTION public.get_public_service_packages_v2(p_booking_slug text)
 RETURNS TABLE(id uuid, name text, description text, package_price numeric, discount_type text, discount_value numeric, estimated_duration integer, services jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.id,p.name,p.description,p.package_price,p.discount_type,p.discount_value,p.estimated_duration,
 coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'description',sc.description,'default_price',sc.labor_price,'estimated_duration',sc.estimated_minutes,'quantity',pi.quantity,'override_price',pi.override_price) order by sc.name) filter(where pi.id is not null),'[]'::jsonb)
 from public.service_packages p join public.workspace_settings ws on ws.workspace_id=p.workspace_id join public.workspaces w on w.id=p.workspace_id
 left join public.service_package_items pi on pi.package_id=p.id left join public.service_catalog sc on sc.id=pi.service_catalog_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled and p.is_active group by p.id order by p.name
$function$;

-- === handle_new_user ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $function$;

-- === has_workspace_role ===
CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles member_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role = any(allowed_roles)
  );
$function$;

-- === is_appointment_item_billable_v1 ===
CREATE OR REPLACE FUNCTION public.is_appointment_item_billable_v1(p_item appointment_items)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(p_item.metadata->>'source','') <> 'inspection_recommendation' then true
    when coalesce(p_item.metadata->>'work_resolution','') = 'unable_to_complete' then false
    else true
  end
$function$;

-- === is_assigned_technician ===
CREATE OR REPLACE FUNCTION public.is_assigned_technician(target_workspace_id uuid, target_work_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.work_order_assignments a
    where a.workspace_id = target_workspace_id
      and a.work_order_id = target_work_order_id
      and a.user_id = auth.uid()
      and a.unassigned_at is null
  );
$function$;

-- === lookup_booking_rewards_v2 ===
CREATE OR REPLACE FUNCTION public.lookup_booking_rewards_v2(p_provider_id uuid, p_email text, p_phone text, p_customer_account_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace uuid;
  v_customer uuid;
  v_matches integer;
  v_account public.crm_loyalty_accounts%rowtype;
  v_available jsonb;
  v_catalog jsonb;
  v_lifetime integer;
  v_phone_digits text;
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  v_phone_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');

  if v_workspace is null
     or length(trim(coalesce(p_email,''))) < 3
     or position('@' in p_email) < 2
     or length(v_phone_digits) < 10 then
    return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;

  select count(*), min(id::text)::uuid
    into v_matches, v_customer
  from public.customers
  where workspace_id = v_workspace
    and lower(email::text) = lower(trim(p_email))
    and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = right(v_phone_digits, 10);

  if v_matches = 0 then
    return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;
  if v_matches > 1 then
    return jsonb_build_object('status','requires_review','candidate_count',v_matches,'points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;

  select * into v_account
  from public.crm_loyalty_accounts
  where workspace_id=v_workspace and customer_id=v_customer;

  if not found then
    return jsonb_build_object(
      'status','matched','match_source','email_phone',
      'masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),
      'masked_phone','***-***-' || right(v_phone_digits,4),
      'points_balance',0,'lifetime_points_earned',0,'visit_count',0,
      'available_rewards','[]'::jsonb,
      'catalog',coalesce((
        select jsonb_agg(jsonb_build_object(
          'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,
          'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,
          'points_remaining',r.points_required,'config',r.config
        ) order by r.points_required)
        from public.crm_loyalty_rewards r
        join public.crm_loyalty_programs p on p.id=r.program_id
        where r.workspace_id=v_workspace and r.status='active' and p.status='active'
      ),'[]'::jsonb)
    );
  end if;

  perform public.ensure_loyalty_reward_instances_v1(v_account.id);

  select coalesce(sum(greatest(points_delta,0)),0)::integer
    into v_lifetime
  from public.crm_loyalty_ledger
  where loyalty_account_id=v_account.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instance_id',i.id,'reward_id',r.id,'name',r.name,'description',r.description,
    'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,
    'status',i.status,'expires_at',i.expires_at,'points_required',r.points_required,
    'points_remaining',0,'config',r.config
  ) order by r.points_required),'[]'::jsonb)
    into v_available
  from public.crm_loyalty_reward_instances i
  join public.crm_loyalty_rewards r on r.id=i.reward_id
  join public.crm_loyalty_programs p on p.id=r.program_id
  where i.loyalty_account_id=v_account.id
    and i.status='available'
    and (i.expires_at is null or i.expires_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,
    'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,
    'points_remaining',greatest(r.points_required-v_account.current_points,0),'config',r.config
  ) order by r.points_required),'[]'::jsonb)
    into v_catalog
  from public.crm_loyalty_rewards r
  join public.crm_loyalty_programs p on p.id=r.program_id
  where r.workspace_id=v_workspace and r.status='active' and p.status='active';

  return jsonb_build_object(
    'status','matched','match_source','email_phone',
    'masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),
    'masked_phone','***-***-' || right(v_phone_digits,4),
    'points_balance',v_account.current_points,'lifetime_points_earned',v_lifetime,
    'available_rewards',v_available,'catalog',v_catalog
  );
end
$function$;

-- === public_booking_insert_services_v2 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v2(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;v_vehicle_id uuid;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_email,v_phone from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 for v_service in select value from jsonb_array_elements(p_services) loop
  v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  if v_vehicle_id is not null and not exists(
   select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id
  ) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;
 end loop;
 return public.insert_booking_appointment_services(p_appointment_id,p_services);
end $function$;

-- === public_booking_insert_services_v3 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v3(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_catalog_price numeric;
 v_config jsonb;v_vehicle_config jsonb;v_size text;v_condition text;v_multiplier numeric;v_flat numeric;
 v_expected numeric;v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;
  v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);
  v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_catalog_price,v_name
   from public.service_catalog sc where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
   v_price:=v_catalog_price;
  else
   v_price:=coalesce((v_service->>'price')::numeric,-1);
   if v_price<0 then raise exception 'INVALID_DYNAMIC_SERVICE_AMOUNT'; end if;

   if v_name='Vehicle size & condition adjustment' then
    select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
    where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
    if v_vehicle_config is null then
      -- Older client configuration keys by client vehicle id, so validate from its pricing snapshot
      select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
      where elem ? 'detailing' limit 1;
    end if;
    v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
    select greatest(coalesce(d.price_multiplier,1),1),greatest(coalesce(d.flat_fee,0),0)
    into v_multiplier,v_flat from public.detailing_pricing_rules d
    where d.workspace_id=v_workspace_id and d.size_tier=v_size and d.condition=v_condition
      and (d.service_catalog_id is null or exists(select 1 from public.service_catalog sc where sc.id=d.service_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active))
    order by d.service_catalog_id nulls last limit 1;
    if not found then raise exception 'INVALID_DETAILING_ADJUSTMENT'; end if;
    select round(coalesce(sum(sc.labor_price),0)*(v_multiplier-1)+v_flat,2) into v_expected
    from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
    join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
    if abs(v_price-v_expected)>0.01 then raise exception 'INVALID_DETAILING_ADJUSTMENT'; end if;
    v_price:=v_expected;
   elsif v_name like 'Tire — %' then
    if v_vehicle_id is null or not exists(
      select 1 from public.inventory_items i
      where i.workspace_id=v_workspace_id and i.id=(
        select nullif(elem#>>'{tire,inventoryItemId}','')::uuid from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
        where elem#>>'{tire,inventoryItemId}' is not null limit 1
      )
    ) then raise exception 'INVALID_TIRE_ITEM'; end if;
    -- Inventory-selected tire pricing is validated later by reservation/inventory pricing; keep bounded client snapshot here.
    if v_price>10000 then raise exception 'INVALID_TIRE_AMOUNT'; end if;
   elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' then
    -- Extra-quart pricing is a dynamic oil-fitment line; tightly bound the quantity/amount until oil pricing is normalized server-side.
    if v_qty>10 or v_price>100 then raise exception 'INVALID_OIL_ADJUSTMENT'; end if;
   else
    raise exception 'UNSUPPORTED_DYNAMIC_SERVICE';
   end if;
  end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
    case when v_catalog_id is not null then 'service_catalog' else 'validated_dynamic' end)));
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;

-- === public_booking_insert_services_v4 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v4(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_catalog_price numeric;
 v_config jsonb;v_vehicle_config jsonb;v_inventory_id uuid;v_extra_quarts numeric;v_oil_price numeric;
 v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;
  v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);
  v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_catalog_price,v_name from public.service_catalog sc
   where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
   v_price:=v_catalog_price;
  elsif v_name like 'Tire — %' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem#>>'{tire,inventoryItemId}','') is not null
     and (v_vehicle_id is null or nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id)
   limit 1;
   v_inventory_id:=nullif(v_vehicle_config#>>'{tire,inventoryItemId}','')::uuid;
   if v_inventory_id is null then raise exception 'INVALID_TIRE_ITEM'; end if;
   select i.sell_price into v_price from public.inventory_items i
   where i.id=v_inventory_id and i.workspace_id=v_workspace_id and i.is_active
     and (i.part_type='tire' or i.category ilike '%tire%' or i.tire_size is not null)
     and i.sell_price is not null and i.sell_price>=0;
   if not found then raise exception 'INVALID_TIRE_ITEM'; end if;
   if v_qty <> coalesce((v_vehicle_config#>>'{tire,frontQuantity}')::numeric,0)+coalesce((v_vehicle_config#>>'{tire,rearQuantity}')::numeric,0)
   then raise exception 'INVALID_TIRE_QUANTITY'; end if;
  elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' or lower(v_name)='additional oil quarts' then
   select greatest(coalesce(ws.oil_price_per_quart,0),0) into v_oil_price from public.workspace_settings ws where ws.workspace_id=v_workspace_id;
   if v_oil_price is null then raise exception 'OIL_PRICE_NOT_CONFIGURED'; end if;
   -- Quantity is the extra-quart count calculated from vehicle capacity by the booking client;
   -- price itself is always server-owned. Quantity remains bounded until capacity normalization moves server-side.
   v_extra_quarts:=v_qty;
   if v_extra_quarts<=0 or v_extra_quarts>10 then raise exception 'INVALID_OIL_QUANTITY'; end if;
   v_price:=v_oil_price;
  else
   raise exception 'UNSUPPORTED_DYNAMIC_SERVICE';
  end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
    case when v_catalog_id is not null then 'service_catalog' when v_name like 'Tire — %' then 'inventory_sell_price' else 'workspace_oil_price' end,
    'inventory_item_id',case when v_name like 'Tire — %' then v_inventory_id::text else null end)));
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;

-- === public_booking_insert_services_v5 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v5(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;
 v_config jsonb;v_vehicle_config jsonb;v_inventory_id uuid;v_oil_price numeric;
 v_size text;v_condition text;v_multiplier numeric;v_flat numeric;v_base numeric;v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_price,v_name from public.service_catalog sc
   where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
  elsif v_name='Vehicle size & condition adjustment' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   if v_vehicle_config is null then raise exception 'INVALID_DETAILING_CONTEXT'; end if;
   v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
   if v_size not in ('compact','midsize','large','oversize') or v_condition not in ('light','moderate','heavy') then raise exception 'INVALID_DETAILING_CONTEXT'; end if;
   select d.price_multiplier,d.flat_fee into v_multiplier,v_flat from public.detailing_pricing_rules d
   where d.workspace_id=v_workspace_id and d.service_catalog_id is null and d.size_tier=v_size and d.condition=v_condition limit 1;
   if not found then raise exception 'DETAILING_PRICE_NOT_CONFIGURED'; end if;
   -- Base is the server-owned catalog subtotal for this exact vehicle's selected services.
   select coalesce(sum(sc.labor_price),0) into v_base
   from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
   join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
   v_price:=round(greatest(0,v_base*(v_multiplier-1)+v_flat),2);v_qty:=1;
  elsif v_name like 'Tire — %' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem#>>'{tire,inventoryItemId}','') is not null and nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   v_inventory_id:=nullif(v_vehicle_config#>>'{tire,inventoryItemId}','')::uuid;
   select i.sell_price into v_price from public.inventory_items i where i.id=v_inventory_id and i.workspace_id=v_workspace_id and i.is_active
    and (i.part_type='tire' or i.category ilike '%tire%' or i.tire_size is not null) and i.sell_price is not null and i.sell_price>=0;
   if not found then raise exception 'INVALID_TIRE_ITEM'; end if;
   if v_qty<>coalesce((v_vehicle_config#>>'{tire,frontQuantity}')::numeric,0)+coalesce((v_vehicle_config#>>'{tire,rearQuantity}')::numeric,0) then raise exception 'INVALID_TIRE_QUANTITY'; end if;
  elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' or lower(v_name)='additional oil quarts' then
   select greatest(coalesce(ws.oil_price_per_quart,0),0) into v_oil_price from public.workspace_settings ws where ws.workspace_id=v_workspace_id;
   if v_oil_price is null then raise exception 'OIL_PRICE_NOT_CONFIGURED'; end if;
   if v_qty<=0 or v_qty>10 then raise exception 'INVALID_OIL_QUANTITY'; end if;v_price:=v_oil_price;
  else raise exception 'UNSUPPORTED_DYNAMIC_SERVICE'; end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
   case when v_catalog_id is not null then 'service_catalog' when v_name='Vehicle size & condition adjustment' then 'detailing_pricing_rules'
   when v_name like 'Tire — %' then 'inventory_sell_price' else 'workspace_oil_price' end)));
  v_count:=v_count+1;
 end loop;return v_count;
end $function$;

-- === public_booking_insert_services_v6 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v6(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_config jsonb;v_vehicle_config jsonb;
 v_inventory_id uuid;v_oil_price numeric;v_capacity_text text;v_capacity numeric;v_extra_quarts numeric;
 v_size text;v_condition text;v_multiplier numeric;v_flat numeric;v_base numeric;v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_price,v_name from public.service_catalog sc
   where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
  elsif v_name='Vehicle size & condition adjustment' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   if v_vehicle_config is null then raise exception 'INVALID_DETAILING_CONTEXT'; end if;
   v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
   select d.price_multiplier,d.flat_fee into v_multiplier,v_flat from public.detailing_pricing_rules d
   where d.workspace_id=v_workspace_id and d.service_catalog_id is null and d.size_tier=v_size and d.condition=v_condition limit 1;
   if not found then raise exception 'DETAILING_PRICE_NOT_CONFIGURED'; end if;
   select coalesce(sum(sc.labor_price),0) into v_base from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
   join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
   v_price:=round(greatest(0,v_base*(v_multiplier-1)+v_flat),2);v_qty:=1;
  elsif v_name like 'Tire — %' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem#>>'{tire,inventoryItemId}','') is not null and nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   v_inventory_id:=nullif(v_vehicle_config#>>'{tire,inventoryItemId}','')::uuid;
   select i.sell_price into v_price from public.inventory_items i where i.id=v_inventory_id and i.workspace_id=v_workspace_id and i.is_active
    and (i.part_type='tire' or i.category ilike '%tire%' or i.tire_size is not null) and i.sell_price is not null and i.sell_price>=0;
   if not found then raise exception 'INVALID_TIRE_ITEM'; end if;
   if v_qty<>coalesce((v_vehicle_config#>>'{tire,frontQuantity}')::numeric,0)+coalesce((v_vehicle_config#>>'{tire,rearQuantity}')::numeric,0) then raise exception 'INVALID_TIRE_QUANTITY'; end if;
  elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' or lower(v_name)='additional oil quarts' then
   if v_vehicle_id is null then raise exception 'OIL_VEHICLE_REQUIRED'; end if;
   select s.oil_capacity into v_capacity_text from public.vehicle_service_specs s
    where s.workspace_id=v_workspace_id and s.vehicle_id=v_vehicle_id;
   if nullif(trim(coalesce(v_capacity_text,'')),'') is null then raise exception 'OIL_CAPACITY_REQUIRED'; end if;
   -- Mirror client parser: first numeric value, gallons converted to quarts; otherwise capacity is quarts.
   begin v_capacity:=substring(v_capacity_text from '([0-9]+(?:\.[0-9]+)?)')::numeric; exception when others then v_capacity:=null; end;
   if v_capacity is null or v_capacity<=0 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   if lower(v_capacity_text) like '%gal%' then v_capacity:=v_capacity*4; end if;
   v_capacity:=round(v_capacity,1);
   v_extra_quarts:=greatest(0,ceil(v_capacity-5));
   if v_extra_quarts<=0 then raise exception 'EXTRA_OIL_NOT_REQUIRED'; end if;
   if v_extra_quarts>10 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   select greatest(coalesce(ws.oil_price_per_quart,0),0) into v_oil_price from public.workspace_settings ws where ws.workspace_id=v_workspace_id;
   if v_oil_price is null then raise exception 'OIL_PRICE_NOT_CONFIGURED'; end if;
   v_qty:=v_extra_quarts;v_price:=v_oil_price;
  else raise exception 'UNSUPPORTED_DYNAMIC_SERVICE'; end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
   case when v_catalog_id is not null then 'service_catalog' when v_name='Vehicle size & condition adjustment' then 'detailing_pricing_rules'
   when v_name like 'Tire — %' then 'inventory_sell_price' else 'workspace_oil_price' end,
   'quantity_source',case when lower(v_name) like '%oil%' and v_catalog_id is null then 'vehicle_service_specs_capacity' else null end)));
  v_count:=v_count+1;
 end loop;return v_count;
end $function$;

-- === public_booking_insert_services_v7 ===
CREATE OR REPLACE FUNCTION public.public_booking_insert_services_v7(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_workspace_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;v_service jsonb;
 v_vehicle_id uuid;v_catalog_id uuid;v_name text;v_qty numeric;v_price numeric;v_config jsonb;v_vehicle_config jsonb;
 v_inventory_id uuid;v_oil_price numeric;v_capacity_text text;v_capacity numeric;v_extra_quarts numeric;
 v_size text;v_condition text;v_multiplier numeric;v_flat numeric;v_base numeric;v_count integer:=0;
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone',''),a.metadata->'booking_configuration'
 into v_customer_id,v_email,v_phone,v_config from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '30 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
 if exists(select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then return 0; end if;

 for v_service in select value from jsonb_array_elements(p_services) loop
  v_catalog_id:=nullif(v_service->>'service_catalog_id','')::uuid;v_vehicle_id:=nullif(v_service->>'vehicle_id','')::uuid;
  v_name:=left(coalesce(v_service->>'name','Service'),250);v_qty:=coalesce((v_service->>'quantity')::numeric,1);
  if v_qty<=0 or v_qty>20 then raise exception 'INVALID_SERVICE_QUANTITY'; end if;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=v_vehicle_id and v.workspace_id=v_workspace_id and v.customer_id=v_customer_id) then raise exception 'INVALID_SERVICE_VEHICLE'; end if;

  if v_catalog_id is not null then
   select greatest(coalesce(sc.labor_price,0),0),sc.name into v_price,v_name from public.service_catalog sc
   where sc.id=v_catalog_id and sc.workspace_id=v_workspace_id and sc.is_active;
   if not found then raise exception 'INVALID_SERVICE'; end if;
  elsif v_name='Vehicle size & condition adjustment' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   if v_vehicle_config is null then raise exception 'INVALID_DETAILING_CONTEXT'; end if;
   v_size:=v_vehicle_config#>>'{detailing,vehicleSize}';v_condition:=v_vehicle_config#>>'{detailing,condition}';
   select d.price_multiplier,d.flat_fee into v_multiplier,v_flat from public.detailing_pricing_rules d
   where d.workspace_id=v_workspace_id and d.service_catalog_id is null and d.size_tier=v_size and d.condition=v_condition limit 1;
   if not found then raise exception 'DETAILING_PRICE_NOT_CONFIGURED'; end if;
   select coalesce(sum(sc.labor_price),0) into v_base from jsonb_array_elements(coalesce(v_vehicle_config->'services','[]'::jsonb)) svc
   join public.service_catalog sc on sc.id=nullif(svc->>'id','')::uuid and sc.workspace_id=v_workspace_id and sc.is_active;
   v_price:=round(greatest(0,v_base*(v_multiplier-1)+v_flat),2);v_qty:=1;
  elsif v_name like 'Tire — %' then
   select elem into v_vehicle_config from jsonb_array_elements(coalesce(v_config->'vehicles','[]'::jsonb)) elem
   where nullif(elem#>>'{tire,inventoryItemId}','') is not null and nullif(elem->>'persistedVehicleId','')::uuid is not distinct from v_vehicle_id limit 1;
   v_inventory_id:=nullif(v_vehicle_config#>>'{tire,inventoryItemId}','')::uuid;
   select i.sell_price into v_price from public.inventory_items i where i.id=v_inventory_id and i.workspace_id=v_workspace_id and i.is_active
    and (i.part_type='tire' or i.category ilike '%tire%' or i.tire_size is not null) and i.sell_price is not null and i.sell_price>=0;
   if not found then raise exception 'INVALID_TIRE_ITEM'; end if;
   if v_qty<>coalesce((v_vehicle_config#>>'{tire,frontQuantity}')::numeric,0)+coalesce((v_vehicle_config#>>'{tire,rearQuantity}')::numeric,0) then raise exception 'INVALID_TIRE_QUANTITY'; end if;
  elsif lower(v_name) like 'extra oil%' or lower(v_name) like '%extra quart%' or lower(v_name)='additional oil quarts' then
   if v_vehicle_id is null then raise exception 'OIL_VEHICLE_REQUIRED'; end if;
   select s.oil_capacity into v_capacity_text from public.vehicle_service_specs s
    where s.workspace_id=v_workspace_id and s.vehicle_id=v_vehicle_id;
   if nullif(trim(coalesce(v_capacity_text,'')),'') is null then raise exception 'OIL_CAPACITY_REQUIRED'; end if;
   -- Mirror client parser: first numeric value, gallons converted to quarts; otherwise capacity is quarts.
   begin v_capacity:=substring(v_capacity_text from '([0-9]+(?:\.[0-9]+)?)')::numeric; exception when others then v_capacity:=null; end;
   if v_capacity is null or v_capacity<=0 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   if lower(v_capacity_text) like '%gal%' then v_capacity:=v_capacity*4; end if;
   v_capacity:=round(v_capacity,1);
   v_extra_quarts:=greatest(0,ceil(v_capacity-5));
   if v_extra_quarts<=0 then raise exception 'EXTRA_OIL_NOT_REQUIRED'; end if;
   if v_extra_quarts>10 then raise exception 'INVALID_OIL_CAPACITY'; end if;
   select greatest(coalesce(ws.oil_price_per_quart,0),0) into v_oil_price from public.workspace_settings ws where ws.workspace_id=v_workspace_id;
   if v_oil_price is null then raise exception 'OIL_PRICE_NOT_CONFIGURED'; end if;
   v_qty:=v_extra_quarts;v_price:=v_oil_price;
  else raise exception 'UNSUPPORTED_DYNAMIC_SERVICE'; end if;

  insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
  values(v_workspace_id,p_appointment_id,v_catalog_id,v_name,v_qty,v_price,false,v_count,
   jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking','price_source',
   case when v_catalog_id is not null then 'service_catalog' when v_name='Vehicle size & condition adjustment' then 'detailing_pricing_rules'
   when v_name like 'Tire — %' then 'inventory_sell_price' else 'workspace_oil_price' end,
   'quantity_source',case when lower(v_name) like '%oil%' and v_catalog_id is null then 'vehicle_service_specs_capacity' else null end)));
  v_count:=v_count+1;
 end loop;return v_count;
end $function$;

-- === public_booking_record_payment_intent_v3 ===
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
begin
 select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,a.source,a.created_at,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_source,v_created_at,v_email,v_phone
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
 if coalesce(v_settings.waste_oil_fee_enabled,false) and v_has_oil then v_waste_fee:=greatest(coalesce(v_settings.waste_oil_fee,0),0); end if;
 select greatest(coalesce(nullif(a.metadata->>'tax_amount','')::numeric,0),0) into v_tax from public.appointments a where a.id=p_appointment_id;
 v_item_subtotal:=round(v_item_subtotal::numeric,2);v_total:=round((v_item_subtotal+v_waste_fee+v_tax)::numeric,2);
 v_canonical_subtotal:=round((v_item_subtotal+v_waste_fee)*100)::bigint;v_canonical_tax:=round(v_tax*100)::bigint;v_canonical_amount:=round(v_total*100)::bigint;

 select id into v_payment_id from public.payments where workspace_id=v_workspace_id
 and metadata->>'appointment_id'=p_appointment_id::text and metadata->>'payment_type'='pay_at_service' order by created_at limit 1 for update;
 if v_payment_id is null then
  insert into public.payments(workspace_id,customer_id,status,amount,currency_code,metadata)
  values(v_workspace_id,v_customer_id,'pending',v_total,upper(left(coalesce(p_currency,'USD'),3)),
   jsonb_build_object('appointment_id',p_appointment_id,'payment_type','pay_at_service',
    'subtotal_cents',v_canonical_subtotal,'tax_amount_cents',v_canonical_tax,'tax_rate',p_tax_rate,
    'customer_email',v_email,'customer_name',left(p_customer_name,160),'collected_amount',0,'source','public_booking',
    'amount_source','canonical_appointment_items','client_amount_cents',p_amount,'client_subtotal_cents',p_subtotal,'client_tax_cents',p_tax_amount))
  returning id into v_payment_id;
 else
  update public.payments set amount=v_total,currency_code=upper(left(coalesce(p_currency,'USD'),3)),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('subtotal_cents',v_canonical_subtotal,'tax_amount_cents',v_canonical_tax,
   'amount_source','canonical_appointment_items','client_amount_cents',p_amount,'client_subtotal_cents',p_subtotal,'client_tax_cents',p_tax_amount),
   updated_at=now()
  where id=v_payment_id and status='pending';
 end if;
 return v_payment_id;
end $function$;

-- === public_booking_save_configuration_v2 ===
CREATE OR REPLACE FUNCTION public.public_booking_save_configuration_v2(p_booking_slug text, p_appointment_id uuid, p_customer_email text, p_customer_phone text, p_configuration jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace_id uuid;v_business_user_id uuid;v_customer_id uuid;v_email text;v_phone text;v_phone_digits text;
begin
 select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 select a.customer_id,lower(coalesce(a.metadata->>'guest_email','')),coalesce(a.metadata->>'guest_phone','')
 into v_customer_id,v_email,v_phone from public.appointments a
 where a.id=p_appointment_id and a.workspace_id=v_workspace_id and a.source='public_booking' and a.created_at>now()-interval '15 minutes';
 if v_customer_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if v_email<>lower(trim(coalesce(p_customer_email,''))) or length(v_phone_digits)<10
 or right(regexp_replace(v_phone,'[^0-9]','','g'),10)<>right(v_phone_digits,10) then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 perform public.save_appointment_booking_configuration(p_appointment_id,v_business_user_id,p_configuration);
end $function$;

-- === public_booking_set_vehicle_tire_spec_v3 ===
CREATE OR REPLACE FUNCTION public.public_booking_set_vehicle_tire_spec_v3(p_booking_slug text, p_customer_email text, p_customer_phone text, p_vehicle_id uuid, p_tire_size text, p_tire_size_source text DEFAULT NULL::text, p_tire_size_front text DEFAULT NULL::text, p_tire_size_rear text DEFAULT NULL::text, p_tire_load_index text DEFAULT NULL::text, p_tire_speed_rating text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_business_user_id uuid;v_workspace_id uuid;v_vehicle_workspace uuid;v_customer_id uuid;v_phone_digits text;
begin
 select c.workspace_id,c.business_user_id into v_workspace_id,v_business_user_id from public.resolve_public_booking_context(p_booking_slug)c;
 if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
 v_phone_digits:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if length(v_phone_digits)<10 then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
 select c.id into v_customer_id from public.customers c where c.workspace_id=v_workspace_id
 and lower(c.email::text)=lower(trim(p_customer_email))
 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10)=right(v_phone_digits,10)
 order by c.created_at limit 1;
 select v.workspace_id into v_vehicle_workspace from public.vehicles v where v.id=p_vehicle_id and v.customer_id is not distinct from v_customer_id;
 if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
 perform public.set_vehicle_tire_spec_v1(v_business_user_id,p_vehicle_id,p_tire_size,p_tire_size_source,p_tire_size_front,p_tire_size_rear,p_tire_load_index,p_tire_speed_rating);
end $function$;

-- === reschedule_customer_appointment_v2 ===
CREATE OR REPLACE FUNCTION public.reschedule_customer_appointment_v2(p_appointment_id uuid, p_new_date date, p_new_time time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_a public.appointments%rowtype;v_s public.workspace_settings%rowtype;v_w public.workspaces%rowtype;v_tz text;v_start timestamptz;v_end timestamptz;v_now timestamptz:=now();v_day text;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.* into v_a from public.appointments a where a.id=p_appointment_id and exists(
 select 1 from public.customer_users cu where cu.user_id=v_uid and cu.customer_id=a.customer_id and cu.workspace_id=a.workspace_id) for update;
 if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 if v_a.status in('cancelled','completed','no_show','in_progress') then return jsonb_build_object('success',false,'message','This appointment can no longer be rescheduled.'); end if;
 select * into v_s from public.workspace_settings where workspace_id=v_a.workspace_id;select * into v_w from public.workspaces where id=v_a.workspace_id;
 if coalesce(v_s.allow_rescheduling,true)=false then return jsonb_build_object('success',false,'message','Online rescheduling is disabled for this shop.'); end if;
 if v_a.starts_at<=v_now+make_interval(hours=>coalesce(v_s.reschedule_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Rescheduling must be done at least %s hours before the appointment.',coalesce(v_s.reschedule_window_hours,24))); end if;
 v_tz:=coalesce(nullif(v_w.timezone,''),'UTC');v_start:=(p_new_date+p_new_time) at time zone v_tz;v_end:=v_start+(v_a.ends_at-v_a.starts_at);v_day:=lower(to_char(p_new_date,'FMDay'));
 if v_start<=v_now or v_start<v_now+make_interval(hours=>coalesce(v_s.min_lead_time_hours,0)) then return jsonb_build_object('success',false,'message','The selected time is inside the booking lead-time window.'); end if;
 if p_new_date>(v_now at time zone v_tz)::date+coalesce(v_s.max_advance_days,30) then return jsonb_build_object('success',false,'message','The selected date is outside the booking window.'); end if;
 if v_s.working_days is not null and array_length(v_s.working_days,1) is not null and not exists(select 1 from unnest(v_s.working_days)d where lower(d)=v_day) then return jsonb_build_object('success',false,'message','The shop is closed on the selected day.'); end if;
 if p_new_time<coalesce(v_s.opening_time,time '00:00') or p_new_time>=coalesce(v_s.closing_time,time '23:59:59') then return jsonb_build_object('success',false,'message','The selected time is outside business hours.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_a.workspace_id::text||':'||v_start::text,0));
 if exists(select 1 from public.appointments a where a.workspace_id=v_a.workspace_id and a.id<>v_a.id and a.status not in('cancelled','no_show') and a.starts_at<v_end and a.ends_at>v_start) then return jsonb_build_object('success',false,'message','That time is no longer available. Please choose another time.'); end if;
 update public.appointments set starts_at=v_start,ends_at=v_end,metadata=(coalesce(metadata,'{}'::jsonb)-'management_token')||jsonb_build_object('rescheduled_at',v_now,'rescheduled_by','customer_portal','previous_starts_at',v_a.starts_at),updated_at=v_now where id=v_a.id;
 return jsonb_build_object('success',true,'appointment_id',v_a.id,'starts_at',v_start,'ends_at',v_end);
end $function$;

-- === reserve_booking_reward_v2 ===
CREATE OR REPLACE FUNCTION public.reserve_booking_reward_v2(p_reward_instance_id uuid, p_appointment_id uuid, p_provider_id uuid, p_customer_email text, p_customer_phone text, p_idempotency_key text DEFAULT NULL::text, p_reservation_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_appointment public.appointments%rowtype;
  v_workspace uuid;
  v_email text;
  v_phone text;
  v_phone_digits text := regexp_replace(coalesce(p_customer_phone,''), '[^0-9]', '', 'g');
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','invalid_reward_context'); end if;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if not found or v_workspace is null or v_instance.workspace_id<>v_workspace
     or v_appointment.workspace_id<>v_workspace or v_instance.customer_id<>v_appointment.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;

  select email::text, phone into v_email, v_phone
  from public.customers where id=v_instance.customer_id and workspace_id=v_workspace;

  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,'')))
     or length(v_phone_digits)<10
     or right(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'),10)<>right(v_phone_digits,10) then
    return jsonb_build_object('status','skipped','reason','customer_mismatch');
  end if;

  if v_instance.status='reserved' and v_instance.reserved_appointment_id=p_appointment_id then
    return jsonb_build_object('status','reserved','idempotent',true,'reward_instance_id',v_instance.id,
      'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until);
  end if;
  if v_instance.status<>'available' then
    return jsonb_build_object('status','skipped','reason','reward_not_available');
  end if;

  update public.crm_loyalty_reward_instances
  set status='reserved',reserved_appointment_id=p_appointment_id,
      reserved_until=now()+make_interval(mins=>greatest(5,least(coalesce(p_reservation_minutes,30),1440))),
      updated_at=now()
  where id=v_instance.id returning * into v_instance;

  return jsonb_build_object('status','reserved','reward_instance_id',v_instance.id,
    'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until);
end
$function$;

-- === resolve_service_recommendation_work_v1 ===
CREATE OR REPLACE FUNCTION public.resolve_service_recommendation_work_v1(p_recommendation_id uuid, p_resolution text, p_notes text DEFAULT NULL::text)
 RETURNS service_recommendations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.service_recommendations;
  ai public.appointment_items;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_resolution not in ('completed','unable_to_complete') then raise exception 'invalid work resolution'; end if;

  select * into r from public.service_recommendations where id=p_recommendation_id for update;
  if r.id is null then raise exception 'recommendation not found'; end if;
  if not public.is_workspace_writer(r.workspace_id) then raise exception 'Workspace writer access required'; end if;

  if r.status=p_resolution then return r; end if;
  if r.status<>'approved' or r.appointment_item_id is null then
    raise exception 'Only approved additional work can be resolved';
  end if;

  select * into ai from public.appointment_items
   where id=r.appointment_item_id
     and workspace_id=r.workspace_id
     and appointment_id=r.appointment_id
   for update;
  if ai.id is null
     or ai.added_at_service is not true
     or ai.metadata->>'vehicle_id' is distinct from r.vehicle_id::text
     or ai.metadata->>'recommendation_id' is distinct from r.id::text
     or ai.metadata->>'inspection_id' is distinct from r.inspection_id::text
  then raise exception 'Approved work appointment item attribution is invalid'; end if;

  update public.appointment_items
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
       'work_resolution',p_resolution,
       'work_resolved_at',now(),
       'work_resolved_by',auth.uid(),
       'unable_to_complete_reason',case when p_resolution='unable_to_complete' then nullif(trim(p_notes),'') else null end
     )),
     updated_at=now()
   where id=ai.id;

  update public.service_recommendations
     set status=p_resolution,
         technician_notes=case
           when nullif(trim(p_notes),'') is null then technician_notes
           when nullif(trim(technician_notes),'') is null then trim(p_notes)
           else technician_notes||E'\n'||trim(p_notes)
         end,
         updated_at=now()
   where id=r.id
   returning * into r;
  return r;
end $function$;

-- === sync_appointment_vehicle_service_records_v1 ===
CREATE OR REPLACE FUNCTION public.sync_appointment_vehicle_service_records_v1(p_workspace_id uuid, p_appointment_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_appt public.appointments%rowtype;
  v_vehicle_ids uuid[];
  v_vehicle_id uuid;
  v_record_id uuid;
  v_record_ids uuid[]:='{}'::uuid[];
  v_work text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  select * into v_appt from public.appointments
   where workspace_id=p_workspace_id and id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  v_vehicle_ids:=public.assert_appointment_vehicle_attribution_v1(p_workspace_id,p_appointment_id);

  foreach v_vehicle_id in array v_vehicle_ids loop
    select string_agg(ai.description, ', ' order by ai.sort_order,ai.created_at)
      into v_work
      from public.appointment_items ai
     where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
       and coalesce((ai.metadata->>'vehicle_id')::uuid,v_appt.vehicle_id)=v_vehicle_id;

    select id into v_record_id from public.service_records
     where workspace_id=p_workspace_id and appointment_id=p_appointment_id and vehicle_id=v_vehicle_id
     order by created_at asc limit 1 for update;

    if v_record_id is null then
      insert into public.service_records(
        workspace_id,appointment_id,customer_id,vehicle_id,completed_by,status,
        work_performed,customer_notes,metadata,completed_at,currency_code
      ) values(
        p_workspace_id,p_appointment_id,v_appt.customer_id,v_vehicle_id,v_actor,'completed',
        coalesce(nullif(v_work,''),nullif(v_appt.metadata->>'description',''),nullif(v_appt.metadata->>'title',''),v_appt.notes,'Completed appointment'),
        v_appt.notes,
        jsonb_build_object('source','appointment_completion','vehicle_scoped',true),
        now(),'USD'
      ) returning id into v_record_id;
    else
      update public.service_records set
        status='completed',completed_by=coalesce(completed_by,v_actor),
        completed_at=coalesce(completed_at,now()),
        work_performed=coalesce(nullif(v_work,''),work_performed),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('vehicle_scoped',true),
        updated_at=now()
      where id=v_record_id;
    end if;
    v_record_ids:=array_append(v_record_ids,v_record_id);
  end loop;
  return v_record_ids;
end $function$;

-- === validate_payment_invoice_customer_v1 ===
CREATE OR REPLACE FUNCTION public.validate_payment_invoice_customer_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_invoice_customer uuid;
begin
  if new.invoice_id is null or new.customer_id is null then return new; end if;
  select customer_id into v_invoice_customer from public.invoices
   where workspace_id=new.workspace_id and id=new.invoice_id;
  if v_invoice_customer is null then raise exception 'Payment invoice not found in workspace'; end if;
  if v_invoice_customer <> new.customer_id then raise exception 'Payment customer must match invoice customer'; end if;
  return new;
end; $function$;

-- === validate_service_recommendation_scope_v1 ===
CREATE OR REPLACE FUNCTION public.validate_service_recommendation_scope_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'Recommendation appointment does not belong to workspace'
      using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id and v.workspace_id = new.workspace_id
  ) then
    raise exception 'Recommendation vehicle does not belong to workspace'
      using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.service_inspections si
    where si.id = new.inspection_id
      and si.workspace_id = new.workspace_id
      and si.appointment_id = new.appointment_id
      and si.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Recommendation inspection does not match appointment vehicle'
      using errcode = '23514';
  end if;

  if new.inspection_result_id is not null and not exists (
    select 1 from public.inspection_results ir
    where ir.id = new.inspection_result_id
      and ir.workspace_id = new.workspace_id
      and ir.inspection_id = new.inspection_id
  ) then
    raise exception 'Recommendation finding does not match inspection'
      using errcode = '23514';
  end if;

  if new.service_catalog_id is not null and not exists (
    select 1 from public.service_catalog sc
    where sc.id = new.service_catalog_id and sc.workspace_id = new.workspace_id
  ) then
    raise exception 'Recommendation service does not belong to workspace'
      using errcode = '23503';
  end if;

  if new.appointment_item_id is not null and not exists (
    select 1 from public.appointment_items ai
    where ai.id = new.appointment_item_id
      and ai.workspace_id = new.workspace_id
      and ai.appointment_id = new.appointment_id
      and ai.added_at_service
      and ai.metadata->>'recommendation_id' = new.id::text
      and ai.metadata->>'vehicle_id' = new.vehicle_id::text
      and ai.metadata->>'inspection_id' = new.inspection_id::text
  ) then
    raise exception 'Recommendation appointment item does not match source metadata'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

