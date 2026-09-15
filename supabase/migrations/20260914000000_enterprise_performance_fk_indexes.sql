-- Enterprise Performance Optimization: Hot Operational Foreign Key Indexes
-- Author: Enterprise Database Hardening
-- Date: 2026-09-14

CREATE INDEX IF NOT EXISTS idx_appointments_workspace_customer ON public.appointments(workspace_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_workspace_vehicle ON public.appointments(workspace_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_customer ON public.invoices(workspace_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_workspace_customer ON public.quotes(workspace_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_service_records_workspace_customer ON public.service_records(workspace_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_service_records_workspace_vehicle ON public.service_records(workspace_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_workspace_appointment ON public.work_orders(workspace_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace_invoice ON public.payments(workspace_id, invoice_id);
