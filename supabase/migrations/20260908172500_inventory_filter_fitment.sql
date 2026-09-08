-- Deterministic oil-filter stock fitment. Exact part-number/SKU matches only.
alter table public.inventory_items add column if not exists part_type text;
create index if not exists inventory_items_workspace_sku_idx
  on public.inventory_items(workspace_id,sku) where is_active=true;
create index if not exists inventory_items_workspace_part_type_idx
  on public.inventory_items(workspace_id,part_type) where is_active=true;

create or replace function public.get_vehicle_inventory_fitment(p_workspace_id uuid,p_vehicle_id uuid)
returns table(
  required_oil_filter text,
  inventory_item_id uuid,
  inventory_name text,
  inventory_sku text,
  warehouse_quantity numeric,
  fitment_status text
)
language sql
security invoker
set search_path=public
as $$
  with required as (
    select nullif(trim(vss.oil_filter),'') as oil_filter
    from public.vehicle_service_specs vss
    where vss.workspace_id=p_workspace_id and vss.vehicle_id=p_vehicle_id
    limit 1
  ), warehouse as (
    select s.inventory_item_id,sum(s.quantity) quantity
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.workspace_id=p_workspace_id
      and l.location_type='warehouse'
      and l.is_active=true
    group by s.inventory_item_id
  )
  select r.oil_filter,
         i.id,
         i.name,
         i.sku,
         coalesce(w.quantity,0),
         case
           when r.oil_filter is null then 'spec_missing'
           when i.id is null then 'not_stocked'
           when coalesce(w.quantity,0)<=0 then 'out_of_stock'
           else 'in_stock'
         end
  from required r
  left join public.inventory_items i
    on i.workspace_id=p_workspace_id
   and i.is_active=true
   and lower(trim(coalesce(i.sku,'')))=lower(trim(r.oil_filter))
   and (i.part_type='oil_filter' or lower(coalesce(i.category,'')) like '%filter%')
  left join warehouse w on w.inventory_item_id=i.id
  where public.is_workspace_member(p_workspace_id);
$$;
