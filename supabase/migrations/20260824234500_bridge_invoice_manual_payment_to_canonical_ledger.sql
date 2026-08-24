-- Compatibility bridge for the current InvoiceDetail UI.
-- Despite the historical function name, this touches only canonical invoices/payments.

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
  v_currency text;
  v_invoice_status public.invoice_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select i.workspace_id, i.customer_id, i.total, i.status, coalesce(w.currency_code,'USD')
    into v_workspace_id, v_customer_id, v_total, v_invoice_status, v_currency
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

  if _amount > greatest(v_total - coalesce((select i.amount_paid from public.invoices i where i.id=_invoice_id),0),0) then
    raise exception 'Payment exceeds invoice balance';
  end if;

  insert into public.payments(
    workspace_id, invoice_id, customer_id, provider, provider_payment_id,
    status, amount, currency_code, paid_at, created_by, metadata
  ) values (
    v_workspace_id, _invoice_id, v_customer_id, null, null,
    'succeeded', round(_amount,2), v_currency, now(), auth.uid(),
    coalesce(_details,'{}'::jsonb) || jsonb_build_object('source','manual_invoice_payment','idempotency_key',_idempotency_key)
  );

  return query
    select i.status::text, i.amount_paid, greatest(i.total - i.amount_paid,0)
    from public.invoices i where i.id = _invoice_id;
end;
$$;

revoke all on function public.record_fleet_invoice_payment(uuid,numeric,text,jsonb) from public, anon;
grant execute on function public.record_fleet_invoice_payment(uuid,numeric,text,jsonb) to authenticated, service_role;
