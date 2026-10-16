-- Atomic finalization of server-calculated public-booking financials.
--
-- The Hono finance layer calculates the snapshot from persisted appointment
-- items, validated discount evidence, configured fees, and server tax. This
-- function persists that result as one transaction and consumes a regular
-- coupon exactly once. It is service-role only; public callers cannot provide
-- their own totals.

create or replace function public.finalize_public_booking_financials_v1(
  p_booking_slug text,
  p_appointment_id uuid,
  p_payment_id uuid,
  p_snapshot jsonb,
  p_discount jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_payment public.payments%rowtype;
  v_total_cents bigint;
  v_tax_cents bigint;
  v_item_subtotal_cents bigint;
  v_discount_cents bigint;
  v_currency text;
  v_discount_kind text;
  v_discount_source_id uuid;
  v_coupon_id uuid;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(trim(coalesce(p_booking_slug,''))) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  if jsonb_typeof(p_snapshot) <> 'object' then raise exception 'INVALID_FINANCIAL_SNAPSHOT'; end if;
  begin
    v_total_cents := (p_snapshot->>'totalCents')::bigint;
    v_tax_cents := (p_snapshot->>'taxCents')::bigint;
    v_item_subtotal_cents := (p_snapshot->>'itemSubtotalCents')::bigint;
    v_discount_cents := coalesce((p_snapshot->>'discountCents')::bigint,0);
  exception when others then
    raise exception 'INVALID_FINANCIAL_SNAPSHOT';
  end;
  if v_total_cents < 0 or v_tax_cents < 0 or v_item_subtotal_cents < 0 or v_discount_cents < 0 then
    raise exception 'INVALID_FINANCIAL_SNAPSHOT';
  end if;
  if coalesce(p_snapshot->>'calculationVersion','') <> 'public_booking_financial_v1' then
    raise exception 'INVALID_FINANCIAL_VERSION';
  end if;
  if coalesce(p_snapshot->>'priceSource','') <> 'canonical_appointment_items' then
    raise exception 'INVALID_PRICE_SOURCE';
  end if;

  select * into v_appointment
  from public.appointments a
  where a.id=p_appointment_id
    and a.workspace_id=v_workspace_id
    and a.source='public_booking'
  for update;
  if not found then raise exception 'INVALID_APPOINTMENT'; end if;

  select * into v_payment
  from public.payments p
  where p.id=p_payment_id
    and p.workspace_id=v_workspace_id
    and p.metadata->>'appointment_id'=p_appointment_id::text
  for update;
  if not found then raise exception 'INVALID_PAYMENT'; end if;

  -- Idempotent finalization: a retry returns the already-persisted canonical
  -- snapshot and never increments coupon usage again.
  if v_payment.metadata->>'financial_state'='canonical' then
    return jsonb_build_object(
      'appointment_id',p_appointment_id,
      'payment_id',p_payment_id,
      'financial_snapshot',v_payment.metadata->'financial_snapshot',
      'idempotent',true
    );
  end if;
  if v_payment.status::text <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;

  select upper(coalesce(w.currency_code,'USD')) into v_currency
  from public.workspaces w where w.id=v_workspace_id;
  if v_currency is null then v_currency:='USD'; end if;

  -- Consume only database-backed regular coupons. Phone-as-coupon evidence is
  -- customer-scoped and has no global usage counter.
  if p_discount is not null and jsonb_typeof(p_discount)='object' then
    v_discount_kind:=p_discount->>'kind';
    if v_discount_kind='coupon' then
      begin v_discount_source_id:=(p_discount->>'sourceId')::uuid;
      exception when others then raise exception 'INVALID_DISCOUNT_EVIDENCE'; end;

      update public.coupon_codes c
      set used_count=coalesce(c.used_count,0)+1,
          updated_at=now()
      where c.id=v_discount_source_id
        and c.workspace_id=v_workspace_id
        and c.is_active=true
        and (c.valid_from is null or c.valid_from<=now())
        and (c.valid_until is null or c.valid_until>=now())
        and (c.max_uses is null or coalesce(c.used_count,0)<c.max_uses)
      returning c.id into v_coupon_id;
      if v_coupon_id is null then raise exception 'COUPON_NO_LONGER_AVAILABLE'; end if;
    elsif v_discount_kind <> 'phone_coupon' then
      raise exception 'INVALID_DISCOUNT_EVIDENCE';
    end if;
  end if;

  update public.payments
  set amount=round(v_total_cents::numeric/100,2),
      currency_code=left(v_currency,3),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
        'financial_state','canonical',
        'financial_snapshot',p_snapshot,
        'discount_evidence',p_discount,
        'canonical_total_cents',v_total_cents,
        'canonical_tax_cents',v_tax_cents,
        'canonical_item_subtotal_cents',v_item_subtotal_cents,
        'canonical_discount_cents',v_discount_cents,
        'financial_finalized_at',now()
      )),
      updated_at=now()
  where id=p_payment_id and workspace_id=v_workspace_id;

  update public.appointments
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
        'pricing_state','canonical',
        'financial_snapshot',p_snapshot,
        'discount_evidence',p_discount,
        'estimated_cost',round(v_total_cents::numeric/100,2),
        'tax_amount',round(v_tax_cents::numeric/100,2),
        'financial_finalized_at',now()
      )),
      updated_at=now()
  where id=p_appointment_id and workspace_id=v_workspace_id;

  return jsonb_build_object(
    'appointment_id',p_appointment_id,
    'payment_id',p_payment_id,
    'financial_snapshot',p_snapshot,
    'idempotent',false
  );
end;
$$;

revoke all on function public.finalize_public_booking_financials_v1(text,uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_public_booking_financials_v1(text,uuid,uuid,jsonb,jsonb) to service_role;
