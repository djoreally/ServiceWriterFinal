# Phase 1 — Canonical Public Booking RPC Inventory

Date: 2026-10-12

Purpose: stop contract drift by identifying one supported database contract for each public-booking operation and explicitly classifying older functions.

## Initial classification

| Capability | Function | Classification | Notes |
|---|---|---|---|
| Resolve booking tenant | `resolve_public_booking_context` | CANONICAL | Booking slug → workspace/business context. |
| Read booking profile | `get_public_booking_profile_v3` | CANONICAL CANDIDATE | Newest discovered profile contract. Must verify current API route calls it. |
| Read booking settings | `get_public_booking_settings_v2` | CANONICAL CANDIDATE | Slug-scoped. |
| Read service catalog | `get_public_service_catalog_v3` | CANONICAL CANDIDATE | Slug-scoped. |
| Read service packages | `get_public_service_packages_v2` | CANONICAL CANDIDATE | Slug-scoped. |
| Read blocked dates | `get_public_blocked_dates_v3` | CANONICAL CANDIDATE | Slug-scoped. |
| Read booked slots | `get_public_booked_slots_v2` | CANONICAL CANDIDATE | Slug-scoped. |
| Upsert booking customer | `public_booking_upsert_customer` | CANONICAL CANDIDATE | Stages entered service address as a transient location intent; does not own appointment address. |
| Upsert booking vehicle | `public_booking_upsert_vehicle` | CANONICAL CANDIDATE | Identity-bound public flow. |
| Create appointment | `public_booking_book_appointment_v3` | CANONICAL | Requires service address, creates appointment-specific `locations` row, persists `appointments.location_id`. |
| Update booking context | `public_booking_update_appointment_context_v2` | CANONICAL CANDIDATE | Identity-bound, creates/updates appointment service location. |
| Insert selected services | `public_booking_insert_services_v7` | CANONICAL CANDIDATE | Newest discovered generation. Must verify route usage. |
| Save booking configuration | `public_booking_save_configuration_v2` | CANONICAL CANDIDATE | Identity-bound. |
| Record payment intent | `public_booking_record_payment_intent_v3` | CANONICAL CANDIDATE | Identity-bound. |

## Legacy surface requiring proof/revocation/removal

The following older generations remain present in production and must not remain ambiguous:

- `book_appointment_safe`
- `public_booking_book_appointment`
- `public_booking_book_appointment_v2`
- `public_booking_insert_services`
- `public_booking_insert_services_v2`
- `public_booking_insert_services_v3`
- `public_booking_insert_services_v4`
- `public_booking_insert_services_v5`
- `public_booking_insert_services_v6`
- older business-user-id based discovery functions where slug-scoped replacements exist
- legacy booking/customer/vehicle functions where the newer identity-bound contract exists

## Certification rule

A function cannot be considered harmless merely because a newer version exists. For every compatibility or legacy function we must establish all four facts:

1. whether application code still calls it;
2. which roles have EXECUTE permission;
3. whether it enforces the same tenant, identity, pricing, scheduling, and location invariants as the canonical function;
4. whether it can be revoked/dropped without breaking supported clients.

Final states are exactly: `CANONICAL`, `COMPATIBILITY_ONLY`, `REVOKED`, or `REMOVE`.
