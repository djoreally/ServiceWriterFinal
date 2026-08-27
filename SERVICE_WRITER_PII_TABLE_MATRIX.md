| Table | Classification | Data elements / flow | Retention direction |
|---|---|---|---|
| `profiles` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `workspaces` | Tenant/security metadata | Organization identity, roles, addresses, business contact/settings | Retain while tenant/account exists plus contractual/legal offboarding period |
| `workspace_members` | Tenant/security metadata | Organization identity, roles, addresses, business contact/settings | Retain while tenant/account exists plus contractual/legal offboarding period |
| `customer_users` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `locations` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `customers` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `vehicles` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `service_catalog` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `filter_catalog` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `appointments` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `work_orders` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `work_order_items` | Internal / unknown | id,workspace_id,work_order_id,service_catalog_id,item_type,description,quantity,unit_price,tax_rate,sort_order,created_at,updated_at | Assign owner, purpose, retention, and access policy before production use |
| `work_order_assignments` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `work_order_events` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `quotes` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `invoices` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `invoice_lines` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `payments` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `fleet_clients` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `fleet_client_contacts` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `fleet_contracts` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `fleet_service_requests` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `fleet_dispatch_assignments` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `provider_connections` | Restricted secret/integration | OAuth tokens, external account IDs, secret references | Server-only; rotate/revoke on disconnect; short operational retention |
| `webhook_events` | Restricted audit evidence | Actor, entity, request/correlation metadata, provider payloads | Immutable access-controlled retention with legal-hold and evidence schedule |
| `audit_events` | Restricted audit evidence | Actor, entity, request/correlation metadata, provider payloads | Immutable access-controlled retention with legal-hold and evidence schedule |
| `message_templates` | Confidential content | Customer-facing and internal message content, variable schemas | Version and retain while active plus approved archival period |
| `messaging_consents` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `messaging_suppressions` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `message_logs` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `message_delivery_events` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `inbound_messages` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `service_records` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `dispatch_events` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `quote_items` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `service_record_line_items` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `quote_conversions` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `invitations` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `invitation_events` | Restricted audit evidence | Actor, entity, request/correlation metadata, provider payloads | Immutable access-controlled retention with legal-hold and evidence schedule |
| `invitation_delivery_attempts` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `user_roles` | Tenant/security metadata | Organization identity, roles, addresses, business contact/settings | Retain while tenant/account exists plus contractual/legal offboarding period |
| `crm_permissions` | Internal / unknown | workspace_id,user_id,capability,granted_by,created_at | Assign owner, purpose, retention, and access policy before production use |
| `crm_profiles` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_activities` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_leads` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `crm_tasks` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_segments` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_campaigns` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_campaign_members` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_loyalty_accounts` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_loyalty_ledger` | PII-linked business data | Customer relationships, segmentation, campaign and loyalty history | Purpose-limit marketing data; honor suppression and deletion requests |
| `crm_audit_events` | Restricted audit evidence | Actor, entity, request/correlation metadata, provider payloads | Immutable access-controlled retention with legal-hold and evidence schedule |
| `account_import_batches` | Restricted import data | Source filenames, row data, mappings, error details | Delete source row/error data after reconciliation window; keep hash/status evidence |
| `account_import_records` | Restricted import data | Source filenames, row data, mappings, error details | Delete source row/error data after reconciliation window; keep hash/status evidence |
| `account_import_mappings` | Restricted import data | Source filenames, row data, mappings, error details | Delete source row/error data after reconciliation window; keep hash/status evidence |
| `workspace_settings` | Tenant/security metadata | Organization identity, roles, addresses, business contact/settings | Retain while tenant/account exists plus contractual/legal offboarding period |
| `appointment_items` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `vehicle_service_specs` | PII-linked operational | Vehicle identifiers, location, schedule, service notes, technician history | Retain per service/warranty/legal schedule; restrict internal notes and assignment data |
| `google_calendar_sync_tokens` | Restricted secret/integration | OAuth tokens, external account IDs, secret references | Server-only; rotate/revoke on disconnect; short operational retention |
| `appointment_calendar_events` | PII-linked integration data | Calendar IDs and appointment linkage | Delete on disconnect and after appointment retention window |
| `lifecycle_event_outbox` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `inventory_items` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `subscription_plans` | Financial / business confidential | Amounts, payment provider IDs, contracts, pricing, inventory, billing | Retain per accounting/tax/contract schedule; minimize provider metadata |
| `abandoned_bookings` | PII / confidential | Identity, contact, address, invitation, consent, or suppression data | Retain only for service, consent, legal, and support purposes; deletion/anonymization workflow required |
| `in_app_notifications` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `tech_push_subscriptions` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |
| `in_app_notification_push_outbox` | PII / delivery-sensitive | Recipients, message content or payloads, push endpoints, retry history | Short operational retention; redact payloads; purge after delivery/audit window |

**Rows:** 67
