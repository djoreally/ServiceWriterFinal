create index if not exists appointments_workspace_customer_idx
  on public.appointments(workspace_id, customer_id);

create index if not exists appointments_workspace_vehicle_idx
  on public.appointments(workspace_id, vehicle_id)
  where vehicle_id is not null;

create index if not exists payments_workspace_customer_idx
  on public.payments(workspace_id, customer_id)
  where customer_id is not null;

create index if not exists payments_workspace_invoice_idx
  on public.payments(workspace_id, invoice_id)
  where invoice_id is not null;

create index if not exists appointment_items_workspace_service_idx
  on public.appointment_items(workspace_id, service_catalog_id)
  where service_catalog_id is not null;

create index if not exists service_records_appointment_idx
  on public.service_records(appointment_id)
  where appointment_id is not null;
