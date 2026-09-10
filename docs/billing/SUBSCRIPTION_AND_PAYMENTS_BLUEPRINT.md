# Service Writer Subscription & Payments Blueprint

Status: CANONICAL COMMERCIAL CONTRACT — implementation must be certified separately.

## Product principle

Service Writer is one operating platform with multiple vertical entrances (mobile automotive, tire, detailing, fleet). Vertical positioning does not fork the core product, database, subscription engine, or payment ledger.

## Canonical plans

### Basic — Free
For solo and early-stage operators.

Includes the core Service Writer operating workflow already present in the product: customers, vehicles, services, appointments, public booking, service records and basic invoicing/operational records.

Excludes Technician OS and Fleet OS.

Basic is intentionally free. It is the acquisition/on-ramp tier, not a crippled trial.

### Pro — $99/month
For growing operators with field/team operations.

Includes everything in Basic plus Technician OS, dispatch/team operations and the full non-fleet shop platform.

Includes up to 3 technician seats.
Additional technician seats: $9.99/month each.

Fleet OS is excluded.

### Fleet — $299/month
For operators serving fleet accounts and managing fleet workflows.

Includes everything in Pro plus Fleet OS and the complete fleet-management layer.

Includes up to 5 technician seats.
Additional technician seats: $7.99/month each.

## Payments add-on — $99/month
Payments is a separately billable add-on, not a plan tier.

A tenant with the Payments add-on may connect its own Stripe merchant account and use Service Writer payment workflows, reconciliation and supported refund flows.

Ordinary shop/customer payments settle to the merchant's own Stripe account. Service Writer takes 0% of ordinary merchant-owned customer transactions.

Payment entitlement must be represented independently from base plan entitlement (for example `payments_addon_active`), and must be enforced server-side. UI gating alone is insufficient.

Marketplace/co-op billing and any future Stripe Connect execution are separate commercial/payment contexts and must not silently alter ordinary merchant payment routing.

## Annual billing

Annual billing receives a 20% discount from twelve months of the corresponding monthly recurring price.

Canonical annual base prices:
- Basic: $0/year
- Pro: $950.40/year
- Fleet: $2,870.40/year
- Payments add-on: $950.40/year

Additional technician seats receive the same 20% annual discount when billed annually:
- Pro additional technician: $95.90/year each (from $9.99 × 12 × 0.80, rounded to cents)
- Fleet additional technician: $76.70/year each (from $7.99 × 12 × 0.80, rounded to cents)

## Entitlement matrix

| Capability | Basic | Pro | Fleet |
|---|---|---|---|
| Core Service Writer | Yes | Yes | Yes |
| Public booking | Yes | Yes | Yes |
| Basic invoicing | Yes | Yes | Yes |
| Technician OS | No | Yes | Yes |
| Included technician seats | N/A | 3 | 5 |
| Additional technician price | N/A | $9.99/mo | $7.99/mo |
| Fleet OS | No | No | Yes |
| Payments | Optional $99 add-on | Optional $99 add-on | Optional $99 add-on |
| SW fee on ordinary merchant transactions | 0% | 0% | 0% |

The exact lower-level feature list for Core, Pro and Fleet must be reconciled against the existing application before enforcement. Existing functionality must not be accidentally removed merely because an old feature flag was named differently.

## Billing composition

A paid tenant subscription is composed rather than encoded as one overloaded plan:

`base plan + additional technician quantity + optional Payments add-on`

This billing subscription is separate from customer service-payment money.

## Required Stripe/payment contexts

1. Service Writer SaaS subscription billing — Service Writer charges the tenant for plan/add-ons/seats.
2. Merchant customer payments — the provider charges its own customers through its own Stripe merchant context; no Service Writer percentage fee.
3. Manual/offline settlements — recorded canonically without fabricating a Stripe transaction.
4. Refunds/partial refunds — reconciled to canonical invoice/payment state with idempotent provider events.
5. Marketplace/co-op billing — separate provider-facing membership/booking-fee accounting.
6. Future Marketplace Connect execution — only where platform-controlled money movement is actually required; never implicitly used for ordinary merchant payments.

## Vertical strategy

Tire, detailing, mobile automotive and fleet are go-to-market/onboarding surfaces over the same platform. Existing product capabilities (including photos and the current operational workflows) should be surfaced and configured for each vertical rather than rebuilt as separate products.

## Migration rule

Legacy identifiers such as `free`, `payg`, `pro`, `business`, `enterprise`, or the temporary public `Stripe` plan cannot remain ambiguous sources of truth. Migration must map historical subscriptions explicitly into the canonical Basic / Pro / Fleet base plan plus independent add-ons. No tenant may be silently upgraded, downgraded, billed, or granted features by a name-only guess.

## Certification gates

Subscription/Payments remains RED until all of the following are evidenced:

- Basic is truly free and usable as the core product.
- Basic cannot invoke Technician OS or Fleet OS server-side.
- Pro gets Technician OS and the non-fleet platform, with exactly 3 included technician seats before paid overage.
- Pro cannot invoke Fleet OS server-side.
- Fleet gets the complete platform and exactly 5 included technician seats before paid overage.
- Additional-seat quantities and prices reconcile to the tenant's actual technician entitlement.
- Annual pricing calculates exactly from the 20% policy and cannot drift between UI, checkout and ledger.
- Payments add-on is independent from the base plan and is enforced server-side.
- A tenant without Payments cannot invoke protected card-processing configuration/execution APIs.
- A tenant with Payments can connect the approved merchant-owned Stripe authorization flow.
- Ordinary merchant customer payments execute in merchant context with 0% Service Writer application fee.
- Invoice → payment → webhook → canonical ledger reconciliation is idempotent.
- Manual payments do not fabricate provider transactions.
- Refund and partial-refund states reconcile correctly.
- SaaS billing money and merchant customer-payment money remain separate.
- Marketplace/co-op fees remain separate from ordinary merchant payments.
- Subscription upgrades, downgrades, cancellation, renewal, failed payment/grace handling and seat changes are tested.
- Existing tenants are migrated explicitly and auditable.
- Pricing/onboarding/settings UI matches the canonical contract.
- Production authenticated E2E passes.
- Mobile/responsive surfaces pass.
- Exact production SHA is READY and runtime evidence is clean.

No passing build, UI card, Stripe object, migration file or unit test alone constitutes GREEN.