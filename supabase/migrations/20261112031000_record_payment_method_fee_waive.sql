-- Restore payment method + card-fee waiver on invoice payment recording.
--
-- Regression: the invoice Record Payment flow (InvoiceDetailDialog ->
-- POST /v1/invoices/:id/fleet-payment -> this RPC) records only an amount
-- and a note. The manual-payment flow this was bridged from carried the
-- payment method and a card-fee waiver end to end:
--   * ManualPaymentDialog's method set: cash / check / external_card /
--     other (unchanged since the frontend was preserved on 2026-08-21).
--   * Commit f3493e351 (2026-09-18, "fix: allow card fee waiver during
--     manual payment"): paying by cash/check/external card could waive
--     the card processing fee -- the fee is subtracted from what is
--     collected and "the waiver is recorded in reconciliation" so the
--     balance still settles. The dialog half was lost in the 2026-09-26
--     certified-snapshot commit (85981f2ac); the invoice dialog never
--     gained either control.
--
-- This migration teaches the bridge RPC to honor the two fields the
-- route now forwards in _details:
--   _details.payment_method  -> lands on the payment row's metadata
--                               (rides in _details verbatim, the same key
--                               the canonical manual_payment action uses).
--   _details.waive_fees=true -> the invoice's configured card surcharge
--                               (metadata.surcharge, when
--                               metadata.surcharge_enabled) is waived:
--                               the collected payment settles
--                               balance-minus-fee and the fee is written
--                               as a succeeded adjustment row using the
--                               canonical waiver shape from the billing
--                               cash close-out (metadata.source =
--                               'manual_adjustment', excluded from
--                               collected totals by the read side),
--                               adjustment_type 'card_fee_waive'. The
--                               reconcile trigger then closes the
--                               invoice PAID: payment + waiver = total.
-- A fee waiver is only valid as part of a settling payment (the amount
-- must equal the balance after the waived fee), matching the historical
-- dialog, which derived the amount from the waived balance and never
-- combined a waiver with a partial receipt.

create or replace function public.record_fleet_invoice_payment(
  _invoice_id uuid,
  _amount numeric,
  _idempotency_key text,
  _details jsonb default '{}'::jsonb
) returns table(status text, amount_paid numeric, balance_due numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_total numeric;
  v_amount_paid numeric;
  v_currency text;
  v_invoice_status public.invoice_status;
  v_metadata jsonb;
  v_balance numeric;
  v_waive_fees boolean;
  v_fee numeric := 0;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select i.workspace_id, i.customer_id, i.total, i.amount_paid, i.status,
         coalesce(w.currency_code,'USD'), coalesce(i.metadata,'{}'::jsonb)
    into v_workspace_id, v_customer_id, v_total, v_amount_paid, v_invoice_status, v_currency, v_metadata
  from public.invoices i
  join public.workspaces w on w.id = i.workspace_id
  where i.id = _invoice_id
  for update of i;

  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice_status = 'void' then raise exception 'Payments cannot be posted to a void invoice'; end if;
  if not public.is_workspace_staff(v_workspace_id) then raise exception 'Workspace staff access required'; end if;

  if exists (
    select 1 from public.payments p
    where p.workspace_id = v_workspace_id
      and p.invoice_id = _invoice_id
      and p.metadata->>'idempotency_key' = _idempotency_key
  ) then
    return query
      select i.status::text, i.amount_paid, greatest(i.total - i.amount_paid,0)
      from public.invoices i where i.id = _invoice_id;
    return;
  end if;

  v_balance := greatest(v_total - coalesce(v_amount_paid,0), 0);

  if _amount > v_balance then
    raise exception 'Payment exceeds invoice balance';
  end if;

  v_waive_fees := coalesce(_details->>'waive_fees', 'false') = 'true';
  if v_waive_fees then
    if coalesce(v_metadata->>'surcharge_enabled', '') = 'true' then
      v_fee := least(
        greatest(coalesce(nullif(v_metadata->>'surcharge', '')::numeric, 0), 0),
        v_balance
      );
    end if;
    if v_fee <= 0 then
      raise exception 'No card processing fee to waive on this invoice';
    end if;
    if round(_amount, 2) <> round(v_balance - v_fee, 2) then
      raise exception 'Fee waiver requires the payment to settle the balance after the waived fee';
    end if;
  end if;

  insert into public.payments(
    workspace_id, invoice_id, customer_id, provider, provider_payment_id,
    status, amount, currency_code, paid_at, created_by, metadata
  ) values (
    v_workspace_id, _invoice_id, v_customer_id, null, null,
    'succeeded', round(_amount,2), v_currency, now(), auth.uid(),
    coalesce(_details,'{}'::jsonb)
      || jsonb_build_object('source','manual_invoice_payment','idempotency_key',_idempotency_key)
      || case when v_waive_fees
           then jsonb_build_object('fee_waive', jsonb_build_object('waived_amount', v_fee, 'waive_reason', 'card_fee_waive'))
           else '{}'::jsonb
         end
  )
  returning id into v_payment_id;

  if v_waive_fees then
    insert into public.payments(
      workspace_id, invoice_id, customer_id, provider, provider_payment_id,
      status, amount, currency_code, paid_at, created_by, metadata
    ) values (
      v_workspace_id, _invoice_id, v_customer_id, null, null,
      'succeeded', round(v_fee,2), v_currency, now(), auth.uid(),
      jsonb_build_object(
        'source', 'manual_adjustment',
        'adjustment_type', 'card_fee_waive',
        'related_payment_id', v_payment_id,
        'note', _details->>'note'
      )
    );
  end if;

  return query
    select i.status::text, i.amount_paid, greatest(i.total - i.amount_paid,0)
    from public.invoices i where i.id = _invoice_id;
end;
$$;

revoke all on function public.record_fleet_invoice_payment(uuid,numeric,text,jsonb) from public, anon;
grant execute on function public.record_fleet_invoice_payment(uuid,numeric,text,jsonb) to authenticated, service_role;
