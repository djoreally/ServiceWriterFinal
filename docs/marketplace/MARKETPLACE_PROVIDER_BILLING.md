# Marketplace Provider Billing

Status: DESIGN CONTRACT / NOT IMPLEMENTED AS A COMPLETE SYSTEM

## Commercial separation

Marketplace billing is separate from ordinary Service Writer SaaS billing and separate from customer service-payment settlement.

A provider may have:

1. a Service Writer SaaS subscription;
2. an optional Marketplace Marketing Co-op membership contribution; and
3. fixed marketplace booking/technology fees for qualifying completed marketplace bookings.

The provider's customer-service revenue remains the provider's revenue and, under the planned model, settles through the provider's own Stripe account.

## Planned fee types

### Co-op contribution

A fixed recurring monthly amount that funds marketplace demand generation and shared growth infrastructure.

The exact amount is not finalized in this document and must remain configurable.

### Marketplace booking fee

Initial modeled amount: $0.25 per completed, positively attributed marketplace booking.

The amount must be stored as plan/policy configuration with versioning, not scattered through application code.

## Billing qualification

A booking fee should accrue only when all required evidence exists:

- canonical appointment exists;
- marketplace attribution is positively established;
- appointment reaches the configured qualifying state, initially `completed`;
- fee has not already been accrued for that appointment/policy version;
- no applicable waiver/reversal rule blocks the fee.

The system must be idempotent. Duplicate webhooks, repeated completion commands, retries, or replays must not create duplicate fees.

## Billing ledger

Booking fees should use an append-only/accrual ledger that supports:

- pending
- accrued
- waived
- reversed
- billed
- paid

Do not delete fee history to correct a mistake. Post a reversal/correction.

## Monthly statement

Provider billing should reconcile against a versioned provider statement showing:

- co-op contribution
- number of qualifying marketplace bookings
- booking fee per qualifying booking
- booking-fee subtotal
- adjustments/reversals
- total marketplace amount due
- measured marketplace activity for the same period when available

Financial totals and marketing-performance metrics should be distinguishable so a missing ad metric can never corrupt the billing ledger.

## Customer payment separation

The marketplace fee is not deducted from each customer transaction under the planned model.

Normal payment path:

Customer -> Provider-owned Stripe -> Provider

Marketplace billing path:

Marketplace ledger -> Provider marketplace statement -> Separate provider billing charge

This separation is deliberate. It prevents Service Writer from taxing the provider's ordinary payment volume and keeps marketplace economics tied to co-op participation and attributable marketplace activity.

## Stripe Connect boundary

Stripe Connect may remain available for future platform-payment requirements, but it is not required merely to charge the provider a co-op subscription or fixed booking fees.

Any future Connect flow must have an explicit transaction-purpose contract and may not silently replace provider-direct payment execution.

## Disputes and corrections

The system should support:

- provider dispute on marketplace attribution
- administrative waiver
- erroneous attribution reversal
- cancelled/completed state correction
- duplicate-fee detection
- statement correction

A disputed booking should preserve evidence and status rather than being erased.

## Certification requirements

Provider billing is not GREEN until:

- policy/config versioning is implemented;
- qualifying events are deterministic;
- duplicate accrual is impossible under retry/replay;
- reversals reconcile correctly;
- statement totals reconcile to ledger rows;
- provider can see only their own statement detail;
- admin aggregate views do not weaken provider RLS;
- production billing is verified against exact deployment SHA.
