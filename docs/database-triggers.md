# Database Trigger Inventory

Date: 2026-11-13 · Jira: SW-47 (SW-65 / SW-66 / SW-67)

Purpose: one page that names every database trigger in the production schema and says, in plain
words, what it creates or changes — so nobody (especially an import) is surprised by rows the
database mints on its own.

Source: the full migration corpus (`supabase/migrations/`, 418 files) replayed in order. All 40
`CREATE TRIGGER` statements in the corpus are still live at the head of the corpus — every
`DROP TRIGGER` in the corpus is a drop-if-exists guard immediately before a re-create in the
same file. Each description below reflects the trigger function's **latest** definition.

## Triggers that create rows in other tables — read these before importing

| Trigger | Fires | What it creates |
|---|---|---|
| `appointments_sync_invoice_v1` | AFTER INSERT or UPDATE (customer, vehicle, start, status, metadata) on `appointments` | Creates the appointment's invoice in `invoices` if none exists, rebuilds its `invoice_lines`, and keeps invoice totals/status in step with the appointment. One appointment → one invoice. |
| `appointment_items_sync_invoice_v1` | AFTER INSERT, UPDATE, or DELETE on `appointment_items` | Re-runs the same invoice sync for the item's appointment: the invoice's lines are rebuilt from the appointment's items. |
| `trg_ensure_service_record_on_completion_insert_v1` | AFTER INSERT on `appointments` when the new row is already `completed` | Mints a `service_records` row for the appointment (insert is conflict-safe: one service record per appointment, never a second). |
| `trg_ensure_service_record_on_completion_update_v1` | AFTER UPDATE of status on `appointments` when status becomes `completed` | Same service-record mint as above, for jobs completed after creation. |
| `trg_award_loyalty_service_record_v1` | AFTER INSERT or UPDATE of status on `service_records` | When a service record completes: creates the customer's `crm_loyalty_accounts` row if missing, adds points, writes a `crm_loyalty_ledger` entry, and mints/refreshes the account's `crm_loyalty_reward_instances`. |
| `in_app_notifications_enqueue_push` | AFTER INSERT on `in_app_notifications` | Inserts a row into `in_app_notification_push_outbox` — the push-delivery queue — for every notification created. |
| `trg_sync_appointment_start_state_v1` | BEFORE UPDATE of status on `appointments` | When a job starts (status → `in_progress`): stamps `metadata.actual_start_time` and inserts a `technician_presence` row for the assigned tech. Also refuses the start if the job is assigned to someone else. |

## Triggers that change money values (no new rows)

| Trigger | Fires | What it changes |
|---|---|---|
| `invoices_assign_number_v1` | BEFORE INSERT on `invoices` | Fills `invoice_number` with the next number in the workspace (highest existing + 1, under a lock) when the new invoice has none. |
| `payments_reconcile_invoice_v1` | AFTER INSERT, UPDATE, or DELETE on `payments` | Recomputes the linked invoice's paid amount, balance, and payment status from all of its payments. |
| `quote_items_canonical_total_v1` | BEFORE INSERT or UPDATE (quantity, unit price, total) on `quote_items` | Forces the line's `total_price` to quantity × unit price. |
| `quote_items_sync_quote_totals_v1` | AFTER INSERT, UPDATE, or DELETE on `quote_items` | Rolls the quote's line totals up onto the parent `quotes` row. |
| `quotes_enforce_line_totals_v1` | BEFORE INSERT or UPDATE (subtotal, tax, total) on `quotes` | Recomputes the quote header's subtotal, tax, and total from its lines — the header cannot disagree with the lines. |

## Guards — they block the write and create nothing

| Trigger | Fires | What it blocks |
|---|---|---|
| `trg_prevent_double_booking` | BEFORE INSERT or UPDATE (workspace, start, end, status) on `appointments` | Overlapping bookings for the same workspace. (See the honesty note below: this function's body is not in the repo.) |
| `trg_enforce_appointment_inspection_completion_v1` | BEFORE UPDATE of status on `appointments` | Completing a job whose vehicle inspection is not finished. |
| `enforce_appointment_recommendation_resolution` | BEFORE UPDATE of status on `appointments` | Completing a job that still has unresolved service recommendations. |

## Stamp triggers — they only fill fields on the same row

| Trigger | Fires | What it stamps |
|---|---|---|
| `appointments_ensure_management_token` | BEFORE INSERT on `appointments` | For website (`public_booking`) bookings with no token yet, mints a `management_token` into the booking's metadata. |
| `in_app_notifications_sync_read_at` | BEFORE UPDATE on `in_app_notifications` | Keeps `read` and `read_at` in agreement when a notification is marked read/unread. |
| The 23 `updated_at` triggers below | BEFORE UPDATE on their table | Sets `updated_at` to now. Nothing else. |

`abandoned_bookings_updated_at` (`abandoned_bookings`) · `appointment_calendar_events_updated_at`
(`appointment_calendar_events`) · `appointment_items_set_updated_at` (`appointment_items`) ·
`customer_users_set_updated_at` (`customer_users`) · `expense_categories_set_updated_at`
(`expense_categories`) · `expense_line_items_set_updated_at` (`expense_line_items`) ·
`expenses_set_updated_at` (`expenses`) · `google_calendar_sync_tokens_updated_at`
(`google_calendar_sync_tokens`) · `inbound_messages_set_updated_at` (`inbound_messages`) ·
`inventory_items_updated_at` (`inventory_items`) · `invitations_set_updated_at` (`invitations`) ·
`lifecycle_event_outbox_set_updated_at` (`lifecycle_event_outbox`) · `message_logs_set_updated_at`
(`message_logs`) · `message_templates_set_updated_at` (`message_templates`) ·
`messaging_consents_set_updated_at` (`messaging_consents`) ·
`messaging_suppressions_set_updated_at` (`messaging_suppressions`) ·
`service_records_touch_updated_at` (`service_records`) ·
`subscription_plans_updated_at` (`subscription_plans`) ·
`tech_push_subscriptions_touch_updated_at` (`tech_push_subscriptions`) ·
`tenant_tracking_settings_updated_at` (`tenant_tracking_settings`) ·
`vehicle_service_specs_set_updated_at` (`vehicle_service_specs`) · `vendors_set_updated_at`
(`vendors`) · `workspace_settings_set_updated_at` (`workspace_settings`)

**Total: 40 triggers** — 7 that create rows elsewhere, 5 that change money values, 3 guards,
25 stamps.

## Honesty notes — what the corpus cannot prove

- **`prevent_double_booking`'s function body is not in the migration corpus.** The corpus only
  hardens its `search_path` (`20261012144500_phase1_runtime_guardrails.sql`); the definition
  itself lives only in production. Its blocking rule above is read from the trigger's name and
  placement, not from verified code.
- **Five trigger-shaped functions exist with no `CREATE TRIGGER` anywhere in the corpus:**
  `handle_new_user`, `enforce_workspace_technician_entitlement_v1`,
  `enqueue_service_recommendation_lifecycle_v1`, `validate_payment_invoice_customer_v1`, and
  `validate_service_recommendation_scope_v1` — all backfilled *from* production in
  `20261010163100_backfill_missing_prod_functions.sql`. Production may have triggers using them
  that were created outside migrations (the classic case is `handle_new_user` on the Supabase
  auth schema). Confirming or ruling that out requires a production catalog read, which this
  inventory did not do.

## For imports

- [ ] **Adopt-and-fill:** before inserting rows that a trigger would mint (an appointment's
  invoice and lines, a completed job's service record, loyalty accounts/ledger/reward rows,
  notification push-outbox rows), check for the trigger-minted row first and fill/adopt it
  instead of creating a duplicate.
