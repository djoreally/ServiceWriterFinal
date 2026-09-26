# Production Database Inventory — Service Writer

Project: `rjfbrfognxqkyhdrpibx` (`service writermain`)

This inventory is read-only evidence from the current production PostgreSQL database. It is the source of truth for Drizzle mapping. No schema migration was applied during this inventory.

## Retained core tables

- workspaces
- workspace_members
- workspace_settings
- customers
- vehicles
- service_catalog
- appointments
- work_orders
- work_order_items
- quotes
- quote_items
- invoices
- payments
- locations
- profiles

## Core lifecycle enums

- appointment_status: requested, confirmed, checked_in, in_progress, completed, cancelled, no_show
- work_order_status: draft, scheduled, assigned, in_progress, waiting_for_parts, awaiting_approval, completed, cancelled
- work_order_priority: low, normal, high, urgent
- invoice_status: draft, issued, partially_paid, paid, void, past_due
- payment_status: pending, succeeded, failed, refunded, partially_refunded
- customer_status: active, inactive, archived
- vehicle_status: active, inactive, sold, archived
- member_role: owner, admin, manager, service_advisor, technician, dispatcher, receptionist, fleet_manager, viewer, customer
- workspace_kind: shop, fleet, hybrid
- integration_provider: stripe, square, quickbooks, google_calendar, resend, sms, carfax, mapbox, ai, other, enginemailer

## Verified tenancy / integrity

All retained core tables audited have RLS enabled. The production schema also uses workspace-scoped foreign keys and indexes across customers, vehicles, appointments, work orders, quotes, invoices and payments.

Important examples:
- appointments -> customers/vehicles/locations are workspace-scoped.
- work_orders -> appointments/customers/vehicles/locations are workspace-scoped.
- quotes -> customers/vehicles/work_orders are workspace-scoped.
- invoices -> customers/vehicles/work_orders are workspace-scoped.
- payments -> customers/invoices are workspace-scoped.
- work order numbers are unique per workspace.
- invoice numbers are unique per workspace.
- vehicle VIN is unique per workspace when present.

## Important corrections versus legacy assumptions

- `appointment_status` does not contain `scheduled`; scheduling belongs to the work-order lifecycle, not appointment status.
- Current invoices use `total`, not `total_amount`.
- `work_order_items` is the retained work-order line-item table.
- No production `invoice_items`, `payment_records`, or `appointment_services` table was found in the retained core inventory.
- The generic starter subscription migration is not production truth and has been removed from rebuild ownership.

## Migration policy

The existing production database is retained. Drizzle maps to it. No destructive migration is allowed during inventory/mapping. Any future DDL must be a deliberate, reviewed delta from this recorded production shape.
