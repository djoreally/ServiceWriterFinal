-- Follow-up: functions inherit EXECUTE from PUBLIC unless it is revoked.
-- Remove PUBLIC first, then grant only the intended caller role.

revoke execute on function public.create_invoice_v1(uuid,jsonb,jsonb) from public;
revoke execute on function public.create_work_order_v1(uuid,jsonb) from public;
revoke execute on function public.patch_draft_invoice_v1(uuid,uuid,jsonb,jsonb) from public;
revoke execute on function public.patch_work_order_v1(uuid,uuid,jsonb) from public;
revoke execute on function public.replace_invoice_lines_v1(uuid,uuid,jsonb) from public;
revoke execute on function public.populate_workspace_service_packages(uuid) from public;
revoke execute on function public.reconcile_service_oil_usage(uuid,uuid,uuid) from public;
revoke execute on function public.seed_default_expense_categories(uuid) from public;
revoke execute on function public.set_inventory_item_stock(uuid,numeric,text) from public;
revoke execute on function public.transfer_inventory_stock(uuid,uuid,numeric,text) from public;
revoke execute on function public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid) from public;
revoke execute on function public.get_workspace_billing_v1(uuid) from public;
revoke execute on function public.get_vehicle_inventory_fitment(uuid,uuid) from public;
grant execute on function public.create_invoice_v1(uuid,jsonb,jsonb),public.create_work_order_v1(uuid,jsonb),public.patch_draft_invoice_v1(uuid,uuid,jsonb,jsonb),public.patch_work_order_v1(uuid,uuid,jsonb),public.replace_invoice_lines_v1(uuid,uuid,jsonb),public.populate_workspace_service_packages(uuid),public.reconcile_service_oil_usage(uuid,uuid,uuid),public.seed_default_expense_categories(uuid),public.set_inventory_item_stock(uuid,numeric,text),public.transfer_inventory_stock(uuid,uuid,numeric,text),public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid),public.get_workspace_billing_v1(uuid),public.get_vehicle_inventory_fitment(uuid,uuid) to authenticated,service_role;

revoke execute on function public.assign_invoice_number_v1() from public;
revoke execute on function public.set_legacy_contract_updated_at() from public;
revoke execute on function public.set_tenant_tracking_updated_at() from public;
revoke execute on function public.sync_in_app_notification_read_at() from public;
revoke execute on function public.touch_in_app_notification_updated_at() from public;
revoke execute on function public.validate_payment_invoice_customer_v1() from public;
grant execute on function public.assign_invoice_number_v1(),public.set_legacy_contract_updated_at(),public.set_tenant_tracking_updated_at(),public.sync_in_app_notification_read_at(),public.touch_in_app_notification_updated_at(),public.validate_payment_invoice_customer_v1() to service_role;
