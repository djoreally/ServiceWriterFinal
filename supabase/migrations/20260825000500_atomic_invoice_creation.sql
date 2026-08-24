create or replace function public.create_invoice_v1(
  p_workspace_id uuid,
  p_header jsonb,
  p_lines jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if jsonb_typeof(coalesce(p_header,'{}'::jsonb)) <> 'object' then raise exception 'p_header must be a JSON object'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then raise exception 'p_lines must be a JSON array'; end if;

  insert into public.invoices(
    workspace_id, customer_id, vehicle_id, work_order_id, status, invoice_number,
    subtotal, tax_total, total, amount_paid, issued_at, due_at, created_by, metadata
  ) values (
    p_workspace_id,
    nullif(p_header->>'customer_id','')::uuid,
    nullif(p_header->>'vehicle_id','')::uuid,
    nullif(p_header->>'work_order_id','')::uuid,
    coalesce(nullif(p_header->>'status','')::public.invoice_status, 'draft'::public.invoice_status),
    nullif(p_header->>'invoice_number','')::bigint,
    coalesce(nullif(p_header->>'subtotal','')::numeric,0),
    coalesce(nullif(p_header->>'tax_total','')::numeric,0),
    coalesce(nullif(p_header->>'total','')::numeric,0),
    0,
    nullif(p_header->>'issued_at','')::timestamptz,
    nullif(p_header->>'due_at','')::timestamptz,
    v_actor,
    coalesce(p_header->'metadata','{}'::jsonb)
  ) returning id into v_id;

  insert into public.invoice_lines(
    workspace_id, invoice_id, vehicle_id, service_catalog_id,
    description, quantity, unit_price, tax_rate, sort_order, metadata
  )
  select
    p_workspace_id,
    v_id,
    nullif(item->>'vehicle_id','')::uuid,
    nullif(item->>'service_catalog_id','')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    coalesce(nullif(item->>'tax_rate','')::numeric,0),
    coalesce(nullif(item->>'sort_order','')::integer, ordinality-1),
    coalesce(item->'metadata','{}'::jsonb)
  from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality as x(item,ordinality);

  return v_id;
end;
$$;

grant execute on function public.create_invoice_v1(uuid,jsonb,jsonb) to authenticated;
revoke execute on function public.create_invoice_v1(uuid,jsonb,jsonb) from anon;
