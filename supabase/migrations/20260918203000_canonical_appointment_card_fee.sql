-- Put the configured card fee into the canonical appointment invoice/receivable.
-- Cash/check waiver can then reconcile against an explicit invoice fee line.
create or replace function public.apply_appointment_card_fee_v1(p_workspace_id uuid,p_appointment_id uuid,p_invoice_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.apply_appointment_card_fee_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_appointment_card_fee_v1(uuid,uuid,uuid) to service_role;
