create or replace function public.replace_invoice_lines_v1(
  p_workspace_id uuid,
  p_invoice_id uuid,
  p_lines jsonb
) returns void
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
end;
$$;

grant execute on function public.replace_invoice_lines_v1(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.replace_invoice_lines_v1(uuid, uuid, jsonb) from anon;
