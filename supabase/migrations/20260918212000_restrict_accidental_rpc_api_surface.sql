-- RLS/RPC API audit: remove accidental anonymous execution from internal RPCs.
-- Public booking/token RPCs remain anonymous intentionally and are audited separately.

revoke execute on function public.is_workspace_writer(uuid) from anon;
revoke execute on function public.is_workspace_financial_writer(uuid) from anon;
revoke execute on function public.technician_transition_job_v1(uuid,text,text,text,text,timestamptz) from anon;

revoke execute on function public.create_invoice_v1(uuid,jsonb,jsonb) from anon;
revoke execute on function public.create_work_order_v1(uuid,jsonb) from anon;
revoke execute on function public.patch_draft_invoice_v1(uuid,uuid,jsonb,jsonb) from anon;
revoke execute on function public.patch_work_order_v1(uuid,uuid,jsonb) from anon;
revoke execute on function public.replace_invoice_lines_v1(uuid,uuid,jsonb) from anon;
revoke execute on function public.populate_workspace_service_packages(uuid) from anon;
revoke execute on function public.reconcile_service_oil_usage(uuid,uuid,uuid) from anon;
revoke execute on function public.seed_default_expense_categories(uuid) from anon;
revoke execute on function public.set_inventory_item_stock(uuid,numeric,text) from anon;
revoke execute on function public.transfer_inventory_stock(uuid,uuid,numeric,text) from anon;
revoke execute on function public.upsert_service_package(uuid,text,text,numeric,text,numeric,boolean,integer,jsonb,uuid) from anon;
revoke execute on function public.get_workspace_billing_v1(uuid) from anon;
revoke execute on function public.get_vehicle_inventory_fitment(uuid,uuid) from anon;

-- Trigger functions are not client APIs.
revoke execute on function public.assign_invoice_number_v1() from anon,authenticated;
revoke execute on function public.set_legacy_contract_updated_at() from anon,authenticated;
revoke execute on function public.set_tenant_tracking_updated_at() from anon,authenticated;
revoke execute on function public.sync_in_app_notification_read_at() from anon,authenticated;
revoke execute on function public.touch_in_app_notification_updated_at() from anon,authenticated;
revoke execute on function public.validate_payment_invoice_customer_v1() from anon,authenticated;

-- These reward mutations are lifecycle internals, not unauthenticated public endpoints.
revoke execute on function public.apply_booking_reward(uuid,uuid,uuid,integer,integer,text) from anon;
revoke execute on function public.cancel_booking_reward(uuid,uuid,text) from anon;
revoke execute on function public.redeem_booking_reward(uuid,uuid,uuid,text) from anon;
