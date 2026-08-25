create or replace function public.patch_draft_invoice_v1(
  p_workspace_id uuid,
  p_invoice_id uuid,
  p_patch jsonb,
  p_lines jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.invoice_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_workspace_staff(p_workspace_id) then
    raise exception 'Workspace staff access required';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'p_patch must be a JSON object';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'p_lines must be a JSON array';
  end if;

  select status into v_status
  from public.invoices
  where workspace_id = p_workspace_id and id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_status <> 'draft'::public.invoice_status then
    raise exception 'Invoice lines can only be replaced while invoice is draft';
  end if;

  update public.invoices
  set
    customer_id = case when p_patch ? 'customer_id' then nullif(p_patch->>'customer_id','')::uuid else customer_id end,
    vehicle_id = case when p_patch ? 'vehicle_id' then nullif(p_patch->>'vehicle_id','')::uuid else vehicle_id end,
    work_order_id = case when p_patch ? 'work_order_id' then nullif(p_patch->>'work_order_id','')::uuid else work_order_id end,
    status = case when p_patch ? 'status' then (p_patch->>'status')::public.invoice_status else status end,
    due_at = case when p_patch ? 'due_at' then nullif(p_patch->>'due_at','')::timestamptz else due_at end,
    issued_at = case when p_patch ? 'issued_at' then nullif(p_patch->>'issued_at','')::timestamptz else issued_at end,
    subtotal = case when p_patch ? 'subtotal' then (p_patch->>'subtotal')::numeric else subtotal end,
    tax_total = case when p_patch ? 'tax_total' then (p_patch->>'tax_total')::numeric else tax_total end,
    total = case when p_patch ? 'total' then (p_patch->>'total')::numeric else total end,
    metadata = case when p_patch ? 'metadata' then coalesce(p_patch->'metadata','{}'::jsonb) else metadata end,
    updated_at = now()
  where workspace_id = p_workspace_id and id = p_invoice_id;

  delete from public.invoice_lines
  where workspace_id = p_workspace_id and invoice_id = p_invoice_id;

  insert into public.invoice_lines(
    workspace_id, invoice_id, vehicle_id, service_catalog_id,
    description, quantity, unit_price, tax_rate, sort_order, metadata
  )
  select
    p_workspace_id,
    p_invoice_id,
    nullif(item->>'vehicle_id','')::uuid,
    nullif(item->>'service_catalog_id','')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    coalesce(nullif(item->>'tax_rate','')::numeric, 0),
    coalesce(nullif(item->>'sort_order','')::integer, ordinality - 1),
    coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as x(item, ordinality);

  return p_invoice_id;
end;
$$;

grant execute on function public.patch_draft_invoice_v1(uuid, uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.patch_draft_invoice_v1(uuid, uuid, jsonb, jsonb) from anon;
