create index if not exists invoice_lines_workspace_invoice_idx on public.invoice_lines(workspace_id, invoice_id);
create index if not exists invoices_created_by_idx on public.invoices(created_by) where created_by is not null;
create index if not exists invoices_workspace_customer_idx on public.invoices(workspace_id, customer_id);
create index if not exists invoices_workspace_vehicle_idx on public.invoices(workspace_id, vehicle_id) where vehicle_id is not null;
create index if not exists invoices_workspace_work_order_idx on public.invoices(workspace_id, work_order_id) where work_order_id is not null;
create index if not exists payments_created_by_idx on public.payments(created_by) where created_by is not null;
