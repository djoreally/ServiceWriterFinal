-- Optional inventory reconciliation for oil usage.
-- Completed service_records remain authoritative even when no inventory exists.

create unique index if not exists inventory_consumption_service_item_unique
  on public.inventory_movements(workspace_id,service_record_id,inventory_item_id)
  where movement_type='consumption' and service_record_id is not null;

create or replace function public.reconcile_service_oil_usage(
  p_service_record_id uuid,
  p_inventory_item_id uuid,
  p_location_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_workspace uuid;
  v_qty numeric;
  v_appt uuid;
  v_item_workspace uuid;
  v_location uuid;
  v_stock numeric;
  v_existing uuid;
  v_movement uuid;
begin
  select workspace_id,oil_quarts_used,appointment_id
    into v_workspace,v_qty,v_appt
  from public.service_records
  where id=p_service_record_id and status='completed';

  if v_workspace is null then raise exception 'Completed service record not found'; end if;
  if coalesce(v_qty,0)<=0 then raise exception 'Completed service has no oil quantity'; end if;
  if not public.has_workspace_role(v_workspace,array['owner','admin','manager','service_advisor','technician']::public.member_role[]) then
    raise exception 'Insufficient inventory role';
  end if;

  select workspace_id into v_item_workspace
  from public.inventory_items
  where id=p_inventory_item_id and is_active=true;
  if v_item_workspace is null or v_item_workspace<>v_workspace then
    raise exception 'Inventory item does not belong to service workspace';
  end if;

  select id into v_existing
  from public.inventory_movements
  where workspace_id=v_workspace
    and service_record_id=p_service_record_id
    and inventory_item_id=p_inventory_item_id
    and movement_type='consumption'
  limit 1;
  if v_existing is not null then return v_existing; end if;

  if p_location_id is null then
    select id into v_location
    from public.inventory_locations
    where workspace_id=v_workspace and location_type='warehouse' and is_active=true
    order by created_at
    limit 1;
  else
    select id into v_location
    from public.inventory_locations
    where id=p_location_id and workspace_id=v_workspace and is_active=true;
  end if;
  if v_location is null then raise exception 'Inventory location not found'; end if;

  select quantity into v_stock
  from public.inventory_stock
  where inventory_item_id=p_inventory_item_id and location_id=v_location
  for update;
  v_stock:=coalesce(v_stock,0);
  if v_stock<v_qty then raise exception 'Insufficient stock for oil reconciliation'; end if;

  update public.inventory_stock
  set quantity=quantity-v_qty,updated_at=now()
  where inventory_item_id=p_inventory_item_id and location_id=v_location;

  insert into public.inventory_movements(
    workspace_id,inventory_item_id,location_id,movement_type,quantity,
    service_record_id,appointment_id,reference_id,notes,created_by,metadata
  ) values (
    v_workspace,p_inventory_item_id,v_location,'consumption',v_qty,
    p_service_record_id,v_appt,'oil-service-'||p_service_record_id::text,
    'Completed service oil reconciliation',auth.uid(),
    jsonb_build_object('source','service_records.oil_quarts_used')
  ) returning id into v_movement;

  return v_movement;
end $$;
