# Database Trigger Inventory

Date: 2026-11-13 · Jira: SW-47 (SW-65 / SW-66 / SW-67)

Purpose: one page that names every database trigger the app actually runs and says, in plain
words, what it creates or changes — so nobody (especially an import) is surprised by rows the
database mints on its own.

**Production-verified against `information_schema.triggers` on 2026-11-13** (Supabase project
`rjfbrfognxqkyhdrpibx`): **80 distinct trigger names / 98 (name × event) rows** — 68 app triggers
(67 in `public` + 1 in `auth`), plus 12 platform triggers owned by Supabase itself (listed in one
note at the end, not inventoried). Provenance for each app trigger was then mined from all 425
`.sql` files in the repo (418 migrations + `supabase/ops/` + import scripts + root/docs SQL).

> **Correction to the first pass:** replaying `supabase/migrations/` alone found only 40
> `CREATE TRIGGER` statements. Production runs 28 more app triggers whose `CREATE TRIGGER`
> was never written into any repo file. This page replaces that count.

Class totals (app, 68): **9 create rows · 5 change values · 6 guards · 48 stamps.**
Provenance totals: 40 triggers have their `CREATE TRIGGER` in the repo; 28 are production-only
(of those 28, 5 have their function body in the repo via the production backfill file
`20261010163100_backfill_missing_prod_functions.sql`, whose header states the bodies are the
actual production definitions).

File paths below are under `supabase/migrations/` unless shown otherwise.

## Triggers that create rows in other tables — read these before importing

| Trigger | Table | Fires | Function | What it creates | Provenance |
|---|---|---|---|---|---|
| `appointments_sync_invoice_v1` | `appointments` | AFTER INSERT; AFTER UPDATE of customer/vehicle/start/status/metadata | `appointments_sync_invoice_trigger_v1` | The appointment's invoice in `invoices` if none exists, its rebuilt `invoice_lines`, and keeps invoice totals/status in step. One appointment → one invoice. | `20260910110000_appointment_invoice_lifecycle_v1.sql` |
| `appointment_items_sync_invoice_v1` | `appointment_items` | AFTER INSERT / UPDATE / DELETE | `appointment_items_sync_invoice_trigger_v1` | Re-runs the same invoice sync for the item's appointment — the invoice's lines are rebuilt from the appointment's items. | `20260910110000_appointment_invoice_lifecycle_v1.sql` |
| `trg_ensure_service_record_on_completion_insert_v1` | `appointments` | AFTER INSERT, when the new row is already `completed` | `ensure_service_record_on_completion_v1` | One `service_records` row for the appointment (conflict-safe: never a second). | `20261110010000_service_record_completion_guarantee.sql` |
| `trg_ensure_service_record_on_completion_update_v1` | `appointments` | AFTER UPDATE of status, when status becomes `completed` | `ensure_service_record_on_completion_v1` | The same service-record mint, for jobs completed after creation. | `20261110010000_service_record_completion_guarantee.sql` |
| `trg_award_loyalty_service_record_v1` | `service_records` | AFTER INSERT; AFTER UPDATE of status | `trg_award_loyalty_service_record_v1` | When a service record completes: the customer's `crm_loyalty_accounts` row if missing, points added, a `crm_loyalty_ledger` entry, and minted/refreshed `crm_loyalty_reward_instances`. | `20260917215118_reconcile_rewards_loyalty_core_functions_20260917.sql` |
| `in_app_notifications_enqueue_push` | `in_app_notifications` | AFTER INSERT | `enqueue_in_app_notification_pushes` | One `in_app_notification_push_outbox` row — the push-delivery queue — per notification created. | `20260827030500_enqueue_in_app_push_outbox.sql` |
| `trg_sync_appointment_start_state_v1` | `appointments` | BEFORE UPDATE of status | `sync_appointment_start_state_v1` | On job start (status → `in_progress`): a `technician_presence` row for the assigned tech (and stamps `metadata.actual_start_time`; also refuses a start by someone the job is not assigned to). | `20261009173500_atomic_start_and_public_booking_location.sql` |
| `service_recommendation_lifecycle` | `service_recommendations` | AFTER INSERT; AFTER UPDATE | `enqueue_service_recommendation_lifecycle_v1` † | A `lifecycle_event_outbox` row when a recommendation is created, and another when its status becomes approved/declined (skipped if the customer has no email). | Trigger: **production-only**. Function body: `20261010163100_backfill_missing_prod_functions.sql` |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user` † | The new user's `public.profiles` row (display name from signup metadata, else email). | **Production-only — not in repo** (no `.sql` file mentions it). Function body: `20261010163100_backfill_missing_prod_functions.sql` |

## Triggers that change values on other rows (money and totals — no new rows)

| Trigger | Table | Fires | Function | What it changes | Provenance |
|---|---|---|---|---|---|
| `invoices_assign_number_v1` | `invoices` | BEFORE INSERT | `assign_invoice_number_v1` | Fills `invoice_number` with the next number in the workspace (highest existing + 1, under a lock) when the new invoice has none. | `20260824225000_canonical_invoice_contract.sql` |
| `payments_reconcile_invoice_v1` | `payments` | AFTER INSERT / UPDATE / DELETE | `payments_reconcile_invoice_trigger_v1` | Recomputes the linked invoice's paid amount, balance, and payment status from all of its payments. | `20260824185500_payment_invoice_reconciliation.sql` |
| `quote_items_canonical_total_v1` | `quote_items` | BEFORE INSERT / UPDATE | `canonicalize_quote_item_total_v1` | Forces the line's `total_price` to quantity × unit price. | `20261001223000_canonical_quote_financial_authority_v1.sql` |
| `quote_items_sync_quote_totals_v1` | `quote_items` | AFTER INSERT / UPDATE / DELETE | `quote_items_sync_totals_trigger_v1` | Rolls the quote's line totals up onto the parent `quotes` row. | `20261001223000_canonical_quote_financial_authority_v1.sql` |
| `quotes_enforce_line_totals_v1` | `quotes` | BEFORE INSERT / UPDATE | `quotes_enforce_line_totals_trigger_v1` | Recomputes the quote header's subtotal, tax, and total from its lines — the header cannot disagree with the lines. | `20261001223000_canonical_quote_financial_authority_v1.sql` |

## Guards — they block the write and create nothing

| Trigger | Table | Fires | Function | What it blocks | Provenance |
|---|---|---|---|---|---|
| `trg_prevent_double_booking` | `appointments` | BEFORE INSERT; BEFORE UPDATE of workspace/start/end/status | `prevent_double_booking` | Overlapping bookings for the same workspace. (Effect inferred — see honesty note: the function body is not in the repo.) | Trigger statement: `20261012144500_phase1_runtime_guardrails.sql`. Function body: **production-only** |
| `trg_enforce_appointment_inspection_completion_v1` | `appointments` | BEFORE UPDATE | `enforce_appointment_inspection_completion_v1` | Completing a job whose vehicle inspection is not finished. | `20260917221036_enforce_vehicle_scoped_inspection_completion_20260917.sql` |
| `enforce_appointment_recommendation_resolution` | `appointments` | BEFORE UPDATE | `enforce_appointment_recommendation_resolution_v1` | Completing a job that still has unresolved service recommendations. | `20260917235800_gate_completion_on_recommendations.sql` |
| `payments_validate_invoice_customer` | `payments` | BEFORE INSERT / UPDATE | `validate_payment_invoice_customer_v1` † | A payment whose invoice is not in the workspace, or whose invoice belongs to a different customer. | Trigger: **production-only**. Function body: `20261010163100_backfill_missing_prod_functions.sql` |
| `validate_service_recommendation_scope` | `service_recommendations` | BEFORE INSERT / UPDATE | `validate_service_recommendation_scope_v1` † | A recommendation whose appointment, vehicle, inspection, finding, catalog service, or appointment item does not belong to the same workspace or does not match the others. | Trigger: **production-only**. Function body: `20261010163100_backfill_missing_prod_functions.sql` |
| `workspace_members_enforce_technician_entitlement` | `workspace_members` | BEFORE INSERT / UPDATE | `enforce_workspace_technician_entitlement_v1` † | Activating a technician beyond the plan's seat limit (pro: 3 + purchased extras; fleet: 5 + extras; other tiers: 0); also errors when workspace billing is not configured. | Trigger: **production-only**. Function body: `20261010163100_backfill_missing_prod_functions.sql` |

## Stamps — they only fill fields on the same row

Two field-sync stamps:

| Trigger | Table | Fires | Function | What it stamps | Provenance |
|---|---|---|---|---|---|
| `appointments_ensure_management_token` | `appointments` | BEFORE INSERT | `ensure_appointment_management_token_v1` | For website (`public_booking`) bookings with no token yet, mints a `management_token` into the booking's metadata. | `20260907155000_issue_management_tokens_for_public_bookings.sql` |
| `in_app_notifications_sync_read_at` | `in_app_notifications` | BEFORE UPDATE | `sync_in_app_notification_read_at` | Keeps `read` and `read_at` in agreement when a notification is marked read/unread. | `20260827030000_in_app_notifications_foundation.sql` |

The other 46 stamps do exactly one thing — BEFORE UPDATE, set the row's `updated_at` to now:

**In the repo (23)** — trigger (table) → function:
`abandoned_bookings_updated_at` (`abandoned_bookings`) → `set_legacy_contract_updated_at` ·
`appointment_calendar_events_updated_at` (`appointment_calendar_events`) → `set_updated_at` ·
`appointment_items_set_updated_at` (`appointment_items`) → `set_updated_at` ·
`customer_users_set_updated_at` (`customer_users`) → `set_identity_updated_at` ·
`expense_categories_set_updated_at` (`expense_categories`) → `set_updated_at` ·
`expense_line_items_set_updated_at` (`expense_line_items`) → `set_updated_at` ·
`expenses_set_updated_at` (`expenses`) → `set_updated_at` ·
`google_calendar_sync_tokens_updated_at` (`google_calendar_sync_tokens`) → `set_identity_updated_at` ·
`inbound_messages_set_updated_at` (`inbound_messages`) → `set_updated_at` ·
`inventory_items_updated_at` (`inventory_items`) → `set_legacy_contract_updated_at` ·
`invitations_set_updated_at` (`invitations`) → `set_identity_updated_at` ·
`lifecycle_event_outbox_set_updated_at` (`lifecycle_event_outbox`) → `set_updated_at` ·
`message_logs_set_updated_at` (`message_logs`) → `set_updated_at` ·
`message_templates_set_updated_at` (`message_templates`) → `set_updated_at` ·
`messaging_consents_set_updated_at` (`messaging_consents`) → `set_updated_at` ·
`messaging_suppressions_set_updated_at` (`messaging_suppressions`) → `set_updated_at` ·
`service_records_touch_updated_at` (`service_records`) → `touch_service_records_updated_at` ·
`subscription_plans_updated_at` (`subscription_plans`) → `set_legacy_contract_updated_at` ·
`tech_push_subscriptions_touch_updated_at` (`tech_push_subscriptions`) → `touch_in_app_notification_updated_at` ·
`tenant_tracking_settings_updated_at` (`tenant_tracking_settings`) → `set_tenant_tracking_updated_at` ·
`vehicle_service_specs_set_updated_at` (`vehicle_service_specs`) → `set_updated_at` ·
`vendors_set_updated_at` (`vendors`) → `set_updated_at` ·
`workspace_settings_set_updated_at` (`workspace_settings`) → `set_updated_at`.

**Production-only (23)** — no `CREATE TRIGGER` anywhere in the repo, and the function each one
executes cannot be found in the repo either, so it is not named here:
`appointments_updated_at` (`appointments`) · `billing_price_catalog_set_updated_at`
(`billing_price_catalog`) · `customers_updated_at` (`customers`) ·
`document_intake_set_updated_at` (`document_intake`) · `filter_catalog_updated_at`
(`filter_catalog`) · `fleet_clients_updated_at` (`fleet_clients`) ·
`fleet_contracts_updated_at` (`fleet_contracts`) · `fleet_dispatch_assignments_updated_at`
(`fleet_dispatch_assignments`) · `fleet_service_requests_updated_at` (`fleet_service_requests`) ·
`invoices_updated_at` (`invoices`) · `locations_updated_at` (`locations`) ·
`payments_updated_at` (`payments`) · `profiles_updated_at` (`profiles`) ·
`provider_connections_set_updated_at` (`provider_connections`) · `quotes_updated_at` (`quotes`) ·
`recurring_expenses_set_updated_at` (`recurring_expenses`) · `service_catalog_updated_at`
(`service_catalog`) · `vehicles_updated_at` (`vehicles`) ·
`work_order_items_updated_at` (`work_order_items`) · `work_orders_updated_at` (`work_orders`) ·
`workspace_billing_set_updated_at` (`workspace_billing`) ·
`workspace_members_updated_at` (`workspace_members`) · `workspaces_updated_at` (`workspaces`).

**Platform triggers (not app triggers, not inventoried):** Supabase manages 12 more —
`storage.buckets` ×9 (`enforce_bucket_name_length_trigger`, `enforce_versioning_status_transition`,
`protect_active_lifecycle_states`, `protect_bucket_control_insert`, `protect_bucket_control_update`,
`protect_bucket_control_update_role`, `protect_buckets_delete`, `wake_lifecycle_on_policy_write`,
`wake_lifecycle_on_versioning_enable`), `storage.objects` ×2 (`protect_objects_delete`,
`update_objects_updated_at`), and `realtime.subscription` (`tr_check_filters`).

## Honesty notes — what the repo cannot prove

- **`prevent_double_booking`'s function body is not in the repo.** What the repo actually holds
  (`20261012144500_phase1_runtime_guardrails.sql`) is the `CREATE TRIGGER` statement itself plus
  `ALTER FUNCTION … SET search_path` hardening and a revoke for `prevent_double_booking()` — no
  `CREATE FUNCTION` for it exists in any of the 425 `.sql` files. The blocking rule above is read
  from the trigger's name and placement, not from verified code; the body lives only in production.
- **`on_auth_user_created` is confirmed in production and appears in zero repo `.sql` files** —
  no `CREATE TRIGGER` for it was ever written to the repo. Its function, `handle_new_user`, does
  exist in the repo (backfilled from production), but nothing in the repo attaches it to
  `auth.users`.
- **† Attributed functions:** for the 5 production-only triggers marked †, the trigger→function
  link is an attribution, not a repo fact: each function is the only trigger function in the
  corpus matching that trigger's table and purpose, and the backfill file states its bodies are
  the actual production definitions. A catalog read of `pg_trigger`/`pg_proc` would confirm the
  exact bindings.
- **23 `updated_at` stamps are production-only with unnamed functions** (listed above): neither
  their `CREATE TRIGGER` nor an identifiable function body exists in the repo, so no function
  name is claimed for them.
- **One name discrepancy to reconcile:** the production trigger-count read lists
  `provider_connections_set_updated_at`; the exported trigger CSV spells the same row
  `provider_connections_updated_at` (same table, same BEFORE UPDATE). The count-read spelling is
  used above; the next catalog read should settle which name production actually carries.

## For imports

- [ ] **Adopt-and-fill:** before inserting rows that a trigger would mint — an appointment's
  invoice and invoice lines, a completed job's service record, loyalty accounts/ledger/reward
  rows, notification push-outbox rows, a job-start `technician_presence` row, recommendation
  lifecycle-outbox rows, a new auth user's profile row — check for the trigger-minted row first
  and fill/adopt it instead of creating a duplicate.
