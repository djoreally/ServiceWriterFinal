-- Payment-intent V3: derive money server-side from persisted appointment items.
-- Caller amounts are retained only for compatibility telemetry; they are not authoritative.
create or replace function public.public_booking_record_payment_intent_v3(
 p_booking_slug text,p_appointment_id uuid,p_amount bigint,p_subtotal bigint,p_tax_amount bigint,p_tax_rate numeric,
 p_currency text,p_customer_email text,p_customer_phone text,p_customer_name text
) returns uuid language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function public.public_booking_record_payment_intent_v3(text,uuid,bigint,bigint,bigint,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.public_booking_record_payment_intent_v3(text,uuid,bigint,bigint,bigint,numeric,text,text,text,text) to anon,authenticated,service_role;
