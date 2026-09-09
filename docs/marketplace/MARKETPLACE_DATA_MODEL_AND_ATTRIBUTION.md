# Marketplace Data Model and Attribution Contract

Status: DESIGN CONTRACT / NOT IMPLEMENTED AS A COMPLETE SYSTEM

This document defines the minimum canonical records required for a truthful Marketplace Marketing Co-op. It does not assert that these tables already exist in production.

## 1. Design rules

1. Existing Service Writer workspace/customer/vehicle/appointment/invoice/payment records remain canonical for normal operations.
2. Marketplace records add commercial provenance; they do not duplicate canonical shop records unnecessarily.
3. Marketplace billing requires positive marketplace evidence. Missing attribution is not billable.
4. Marketing metrics must preserve source provenance and measurement windows.
5. Provider-private data remains tenant scoped.

## 2. Proposed canonical entities

### marketplace_memberships

Purpose: records provider enrollment in the co-op.

Suggested fields:

- id
- workspace_id
- status: applied | waitlisted | approved | active | paused | cancelled
- market_cell_id
- contribution_plan_id
- joined_at
- activated_at
- paused_at
- cancelled_at
- qualification_state
- terms_version
- created_at
- updated_at

### marketplace_market_cells

Purpose: defines a local acquisition market.

Suggested fields:

- id
- name
- slug
- geography_definition jsonb
- activation_state
- timezone
- currency
- capacity_policy jsonb
- budget_policy jsonb
- created_at
- updated_at

### marketplace_provider_capacity

Purpose: captures the supply signal used to decide whether a market can safely acquire more demand.

Suggested fields:

- id
- workspace_id
- market_cell_id
- service_category_id
- effective_date
- available_slots
- reserved_slots
- max_incremental_marketplace_jobs
- source
- measured_at

### marketplace_attribution

Purpose: binds marketplace provenance to a canonical booking/appointment.

Suggested fields:

- id
- workspace_id
- appointment_id
- source_type
- market_cell_id
- campaign_id
- campaign_external_id
- ad_group_external_id
- ad_external_id
- landing_path
- utm_source
- utm_medium
- utm_campaign
- utm_term
- utm_content
- discovery_session_id
- provider_profile_view_id
- attributed_at
- attribution_method
- confidence
- created_at

Hard rule: only deterministic/approved attribution methods may trigger billing.

### marketplace_campaigns

Purpose: internal campaign registry for market-cell performance and platform synchronization.

Suggested fields:

- id
- market_cell_id
- platform
- external_campaign_id
- objective
- status
- budget_cents
- start_at
- end_at
- configuration jsonb
- created_at
- updated_at

### marketplace_marketing_spend

Purpose: immutable or append-only spend observations imported from advertising platforms or reconciled statements.

Suggested fields:

- id
- market_cell_id
- campaign_id
- platform
- external_reference
- spend_cents
- period_start
- period_end
- source_type
- imported_at
- reconciliation_status

### marketplace_booking_fees

Purpose: accrues the small fixed booking/technology fee.

Suggested fields:

- id
- workspace_id
- appointment_id
- attribution_id
- fee_cents
- status: pending | accrued | waived | reversed | billed | paid
- qualification_event
- qualified_at
- reversed_at
- provider_statement_id
- created_at

Default modeled fee: 25 cents. This value must live in plan/policy configuration rather than code.

### marketplace_provider_statements

Purpose: provider-visible period statement.

Suggested fields:

- id
- workspace_id
- market_cell_id
- period_start
- period_end
- contribution_cents
- booking_fee_cents
- attributed_bookings
- completed_bookings
- attributed_value_cents nullable
- measured_impressions nullable
- measured_clicks nullable
- measured_spend_cents nullable
- measured_cac_cents nullable
- statement_snapshot jsonb
- finalized_at
- version

Finalized statements should be versioned/immutable except through a corrective statement.

### marketplace_agent_recommendations

Purpose: keeps AI recommendations separate from executed changes.

Suggested fields:

- id
- market_cell_id
- recommendation_type
- evidence_snapshot jsonb
- proposed_change jsonb
- risk_level
- status: proposed | approved | rejected | executed | expired
- created_by
- approved_by
- approved_at
- executed_at

## 3. Booking source taxonomy

Canonical initial taxonomy:

- direct_shop
- shop_booking_page
- marketplace
- marketplace_campaign
- fleet_direct
- manual
- repeat_customer
- unknown

`marketplace_campaign` is used when a campaign/ad-level source can be positively identified.

`marketplace` is used when the customer entered through a marketplace discovery surface but campaign provenance is unavailable.

## 4. Attribution lifecycle

Discovery/session evidence
-> provider/profile exposure
-> provider selection
-> booking creation
-> attribution record
-> canonical appointment lifecycle
-> completion/cancellation/refund outcome
-> booking-fee qualification
-> statement accrual

Attribution must not be rewritten simply because a later payment occurs. Corrections require auditable provenance.

## 5. Booking-fee qualification

Recommended initial trigger: completed marketplace-attributed appointment.

Do not accrue for:

- abandoned discovery sessions
- profile views
- leads that never book
- direct-shop bookings
- manual appointments without marketplace provenance
- cancelled marketplace bookings
- unknown source

Refund/rework policy remains a business decision. The ledger should support fee reversal without deleting history.

## 6. Payment separation

Marketplace attribution does not automatically imply Stripe Connect.

For the planned co-op model, marketplace-attributed work may still settle through the provider's direct Stripe account. The marketplace booking fee is billed separately to the provider.

Payment execution context and booking attribution must therefore be separate fields/concepts.

## 7. RLS and privacy

Provider users may access their own membership, attribution, booking fees, statements, and approved market-level aggregate data.

They may not access another provider's private appointments, customers, revenue, pricing, capacity detail, or individual campaign attribution unless explicitly authorized by a separate administrative role.

Public marketplace APIs should expose only deliberately public provider fields through narrow server contracts.

## 8. Evidence quality

Every derived metric should retain enough provenance to answer:

- Which source produced this number?
- What date range does it cover?
- Was it measured or estimated?
- Which bookings were included?
- Which spend rows were included?
- Which market/provider rules were in effect?

If the system cannot answer those questions, the metric is not certification-grade evidence.
