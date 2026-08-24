alter table public.work_orders
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists work_orders_workspace_status_updated_idx
  on public.work_orders(workspace_id, status, updated_at desc);

create index if not exists work_order_assignments_workspace_work_order_active_idx
  on public.work_order_assignments(workspace_id, work_order_id)
  where unassigned_at is null;

comment on column public.work_orders.metadata is
  'Captured operational attributes not represented as canonical work-order columns, such as signature, VIN/mileage capture, and freeform location snapshot.';
