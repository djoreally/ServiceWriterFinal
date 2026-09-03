-- Preserve existing RLS semantics while evaluating auth.uid() once per statement.
alter policy profiles_self_select on public.profiles using (id = (select auth.uid()));
alter policy profiles_self_update on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy assignments_self_select on public.work_order_assignments using (user_id = (select auth.uid()));
alter policy fleet_dispatch_technician_select on public.fleet_dispatch_assignments using (technician_id = (select auth.uid()));
alter policy customer_users_self_select on public.customer_users using (user_id = (select auth.uid()));
alter policy user_roles_self_select on public.user_roles using (user_id = (select auth.uid()));

alter policy assets_select_own on public.assets using (user_id = (select auth.uid()));
alter policy assets_insert_own on public.assets with check (user_id = (select auth.uid()));
alter policy assets_update_own on public.assets using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy assets_delete_own on public.assets using (user_id = (select auth.uid()));

alter policy google_calendar_sync_tokens_owner_select on public.google_calendar_sync_tokens using ((select auth.uid()) = user_id);
alter policy google_calendar_sync_tokens_owner_write on public.google_calendar_sync_tokens using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy appointment_calendar_events_owner_select on public.appointment_calendar_events using ((select auth.uid()) = user_id);
alter policy appointment_calendar_events_owner_write on public.appointment_calendar_events using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter policy inventory_items_owner_all on public.inventory_items using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy subscription_plans_owner_all on public.subscription_plans using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy abandoned_bookings_owner_read on public.abandoned_bookings using (user_id = (select auth.uid()));
alter policy abandoned_bookings_owner_write on public.abandoned_bookings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy invitations_admin_insert on public.invitations with check (public.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));
alter policy invitation_events_admin_insert on public.invitation_events with check (public.is_workspace_admin(workspace_id) and actor_user_id = (select auth.uid()));
alter policy invitation_delivery_attempts_admin_insert on public.invitation_delivery_attempts with check (public.is_workspace_admin(workspace_id) and actor_user_id = (select auth.uid()));
alter policy message_logs_staff_insert on public.message_logs with check (public.is_workspace_staff(workspace_id) and created_by = (select auth.uid()));
alter policy messaging_consents_staff_write on public.messaging_consents with check (public.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));
alter policy messaging_suppressions_staff_write on public.messaging_suppressions with check (public.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

alter policy in_app_notifications_select_own on public.in_app_notifications using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy in_app_notifications_insert_own on public.in_app_notifications with check (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy in_app_notifications_update_own on public.in_app_notifications using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id))) with check (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy in_app_notifications_delete_own on public.in_app_notifications using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));

alter policy tech_push_subscriptions_select_own on public.tech_push_subscriptions using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy tech_push_subscriptions_insert_own on public.tech_push_subscriptions with check (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy tech_push_subscriptions_update_own on public.tech_push_subscriptions using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id))) with check (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy tech_push_subscriptions_delete_own on public.tech_push_subscriptions using (user_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_staff(workspace_id)));
alter policy in_app_notification_push_outbox_select_own on public.in_app_notification_push_outbox using (exists (select 1 from public.in_app_notifications n where n.id = in_app_notification_push_outbox.notification_id and n.user_id = (select auth.uid())));

alter policy quote_conversions_member_select on public.quote_conversions using (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_conversions.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active));
alter policy quote_conversions_operator_insert on public.quote_conversions with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_conversions.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor'])));
alter policy quote_items_member_select on public.quote_items using (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active));
alter policy quote_items_operator_write on public.quote_items using (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor']))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor'])));
alter policy service_record_line_items_member_select on public.service_record_line_items using (exists (select 1 from public.workspace_members wm where wm.workspace_id = service_record_line_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active));
alter policy service_record_line_items_operator_write on public.service_record_line_items using (exists (select 1 from public.workspace_members wm where wm.workspace_id = service_record_line_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor']))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = service_record_line_items.workspace_id and wm.user_id = (select auth.uid()) and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor'])));

-- Remove exact duplicate indexes only; keep one canonical copy of each definition.
drop index if exists public.audit_events_workspace_time_idx;
drop index if exists public.quotes_workspace_id_id_uidx;
