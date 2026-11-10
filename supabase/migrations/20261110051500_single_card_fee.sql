-- Single card fee (2026-11-10).
--
-- The defect: a completion invoice carries the workspace card fee TWICE.
-- sync_appointment_invoice_v1 (the canonical invoice rebuild, fired by
-- the completion triggers) already applies the workspace surcharge --
-- the "Card Processing Fee" -- as an invoice line keyed
-- metadata.fee_key='surcharge', computed on the pre-fee base
-- (items + waste fee + shop fee) and included in the invoice subtotal
-- and total. apply_appointment_card_fee_v1 then applies the SAME
-- settings-driven surcharge a second time: it deletes only lines keyed
-- 'card_processing_fee', computes its base from the invoice total --
-- which already contains the sync fee -- inserts a second fee line, and
-- bumps subtotal/total again. Production proof: INV-569 (110.23 service
-- + 4.00 waste fee) carries a $3.31 'surcharge' line AND a second fee
-- recorded as metadata card_fee_amount $3.53.
--
-- The design the codebase intends (src/lib/financialMath.ts: fee order
-- subtotal -> waste oil -> shop fee -> surcharge -> tax -> total, the
-- surcharge being the one card-processing fee, based on
-- subtotal + waste + shop; src/application/queries/invoices.query.ts:
-- the fee_key vocabulary is waste_oil_fee | surcharge | shop_fee | tax)
-- is that sync_appointment_invoice_v1 owns the fee. It is left untouched.
--
-- This migration replaces apply_appointment_card_fee_v1 ONLY, turning
-- it into an ensure-exactly-once operation with the same signature,
-- return value, settings source, and line shape:
--   * If the invoice already carries the sync 'surcharge' fee line,
--     that fee IS the card fee: it is adopted -- recorded in
--     card_fee_amount/card_fee_cents -- and no line or total changes.
--   * This function's own legacy 'card_processing_fee' lines are
--     deleted AND their amount is backed out of the working subtotal
--     and total before anything is computed (the old body deleted the
--     lines but left their amount inside the base, so a repeat call
--     compounded). Re-running this function on an already-doubled
--     invoice therefore repairs it back to the single sync fee.
--   * If no sync fee line exists (an invoice the sync never touched),
--     the fee is computed the canonical way -- the settings formula on
--     the pre-fee subtotal (items + waste + shop) instead of the
--     fee-loaded invoice total -- and added exactly once, with the
--     same insert shape as before.
--   * pre_card_fee_total now states the invoice total excluding the
--     single card fee (final total - fee), matching its name in every
--     branch.
--
-- This migration replaces a function ONLY. It writes no invoice,
-- payment, or appointment rows: correcting invoices already doubled
-- in production is a separate owner-approved data step.

-- === apply_appointment_card_fee_v1 (single-fee) ===
CREATE OR REPLACE FUNCTION public.apply_appointment_card_fee_v1(p_workspace_id uuid, p_appointment_id uuid, p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.workspace_settings%rowtype; inv public.invoices%rowtype; fee numeric:=0; base numeric:=0;
  sync_fee numeric:=0; own_fee numeric:=0; new_subtotal numeric:=0; new_total numeric:=0;
begin
  select * into s from public.workspace_settings where workspace_id=p_workspace_id;
  select * into inv from public.invoices where workspace_id=p_workspace_id and id=p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;

  -- The card fee already on this invoice, by writer: the canonical sync
  -- line ('surcharge') and this function's own legacy lines
  -- ('card_processing_fee').
  select coalesce(sum(quantity*unit_price),0) into sync_fee
    from public.invoice_lines
    where workspace_id=p_workspace_id and invoice_id=p_invoice_id and metadata->>'fee_key'='surcharge';
  select coalesce(sum(quantity*unit_price),0) into own_fee
    from public.invoice_lines
    where workspace_id=p_workspace_id and invoice_id=p_invoice_id and metadata->>'fee_key'='card_processing_fee';

  -- Remove this function's own lines and back their amount out of the
  -- working totals, so the base below is the pre-fee invoice.
  delete from public.invoice_lines where workspace_id=p_workspace_id and invoice_id=p_invoice_id and metadata->>'fee_key'='card_processing_fee';
  new_subtotal:=round(coalesce(inv.subtotal,0)-own_fee,2);
  new_total:=round(coalesce(inv.total,0)-own_fee,2);

  if sync_fee>0 then
    -- The canonical sync already applied the card fee exactly once.
    -- Adopt it: record it, change nothing else.
    fee:=round(sync_fee,2);
  else
    -- No fee on the invoice yet: compute it the canonical way, on the
    -- pre-fee subtotal (items + waste fee + shop fee).
    base:=new_subtotal;
    if coalesce(s.surcharge_enabled,false) and coalesce(s.surcharge_value,0)>0 then
      fee:=case when s.surcharge_type='fixed' then round(s.surcharge_value,2)
        else round(base*(s.surcharge_value/100.0),2) end;
    end if;
    if fee>0 then
      insert into public.invoice_lines(workspace_id,invoice_id,description,quantity,unit_price,tax_rate,vehicle_id,service_catalog_id,sort_order,metadata)
      select p_workspace_id,p_invoice_id,coalesce(nullif(s.surcharge_description,''),'Card Processing Fee'),1,fee,0,a.vehicle_id,null,10000,
        jsonb_build_object('appointment_id',p_appointment_id::text,'source','appointment_fee','fee_key','card_processing_fee','surcharge_type',s.surcharge_type,'surcharge_value',s.surcharge_value)
      from public.appointments a where a.workspace_id=p_workspace_id and a.id=p_appointment_id;
      new_subtotal:=round(new_subtotal+fee,2);
      new_total:=round(new_total+fee,2);
    end if;
  end if;

  if fee>0 then
    update public.invoices set subtotal=new_subtotal,total=new_total,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('card_fee_amount',fee,'card_fee_cents',round(fee*100)::integer,'pre_card_fee_total',round(new_total-fee,2)),updated_at=now()
    where workspace_id=p_workspace_id and id=p_invoice_id;
  else
    update public.invoices set subtotal=new_subtotal,total=new_total,
      metadata=(coalesce(metadata,'{}'::jsonb)-'card_fee_amount'-'card_fee_cents')||jsonb_build_object('pre_card_fee_total',new_total),updated_at=now()
    where workspace_id=p_workspace_id and id=p_invoice_id;
  end if;
  return fee;
end $function$;
