revoke all on function public.payments_reconcile_invoice_trigger_v1() from public, anon, authenticated;
revoke all on function public.reconcile_invoice_payment_balance_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.payments_reconcile_invoice_trigger_v1() to service_role;
grant execute on function public.reconcile_invoice_payment_balance_v1(uuid, uuid) to service_role;

revoke all on function public.complete_appointment_v1(uuid, uuid) from public, anon;
grant execute on function public.complete_appointment_v1(uuid, uuid) to authenticated, service_role;

comment on function public.complete_appointment_v1(uuid, uuid) is 'Authenticated staff RPC. SECURITY DEFINER is intentional; function requires auth.uid() and is_workspace_staff(workspace_id) before mutation.';
comment on function public.payments_reconcile_invoice_trigger_v1() is 'Internal trigger function; not exposed to anon/authenticated API roles.';
comment on function public.reconcile_invoice_payment_balance_v1(uuid, uuid) is 'Internal invoice reconciliation helper invoked by payment trigger; not exposed to anon/authenticated API roles.';
