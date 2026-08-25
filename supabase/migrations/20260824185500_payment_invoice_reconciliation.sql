create or replace function public.reconcile_invoice_payment_balance_v1(p_workspace_id uuid, p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric := 0;
  v_total numeric := 0;
  v_due_at timestamptz;
  v_status public.invoice_status;
begin
  if p_invoice_id is null then return; end if;

  select i.total, i.due_at, i.status
    into v_total, v_due_at, v_status
  from public.invoices i
  where i.workspace_id = p_workspace_id and i.id = p_invoice_id
  for update;

  if not found then return; end if;

  select coalesce(sum(
    case p.status::text
      when 'succeeded' then p.amount
      when 'partially_refunded' then greatest(
        p.amount - coalesce(nullif(p.metadata ->> 'refunded_amount', '')::numeric, 0),
        0
      )
      else 0
    end
  ), 0)
  into v_paid
  from public.payments p
  where p.workspace_id = p_workspace_id and p.invoice_id = p_invoice_id;

  update public.invoices i
  set amount_paid = v_paid,
      status = case
        when v_status = 'void'::public.invoice_status then v_status
        when v_total > 0 and v_paid >= v_total then 'paid'::public.invoice_status
        when v_paid > 0 then 'partially_paid'::public.invoice_status
        when v_due_at is not null and v_due_at < now() then 'past_due'::public.invoice_status
        when v_status = 'draft'::public.invoice_status then 'draft'::public.invoice_status
        else 'issued'::public.invoice_status
      end,
      updated_at = now()
  where i.workspace_id = p_workspace_id and i.id = p_invoice_id;
end;
$$;

create or replace function public.payments_reconcile_invoice_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is not null then
    perform public.reconcile_invoice_payment_balance_v1(old.workspace_id, old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.invoice_id is not null then
    perform public.reconcile_invoice_payment_balance_v1(new.workspace_id, new.invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_reconcile_invoice_v1 on public.payments;
create trigger payments_reconcile_invoice_v1
after insert or update or delete on public.payments
for each row execute function public.payments_reconcile_invoice_trigger_v1();

do $$
declare r record;
begin
  for r in select distinct workspace_id, invoice_id from public.payments where invoice_id is not null
  loop
    perform public.reconcile_invoice_payment_balance_v1(r.workspace_id, r.invoice_id);
  end loop;
end $$;
