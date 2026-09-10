# Marketplace Certification Gates

Status: CANONICAL FUTURE GREEN CONTRACT

Marketplace remains RED / NOT CERTIFIED until every required gate below is proven against production evidence. Existing code, routes, migrations, mocks, demos, screenshots, or passing unit tests alone are insufficient.

## Certification principles

- Absence of evidence is not evidence of GREEN.
- Code presence does not prove runtime behavior.
- A successful build does not certify a feature.
- A successful API call does not certify the user journey.
- Do not infer production database state from migrations; query production.
- Do not infer deployed code from `main`; verify exact production SHA.
- Do not substitute fixtures or fallbacks for canonical production contracts unless the certification explicitly tests fallback behavior.
- Unknown attribution cannot produce a billable marketplace fee.
- A provider-direct transaction must never silently become a marketplace/Connect transaction.

## Gate 0 — Scope truth

Prove:

- public pages accurately describe what is live versus planned;
- no fake cities/provider counts/bookings/ROI/testimonials;
- current commercial terms match canonical configuration and provider agreement;
- deferred marketing-agent capabilities are not presented as active.

## Gate 1 — Provider enrollment

Prove:

- provider can apply/opt in;
- authorized staff can approve/waitlist/pause/cancel;
- tenant boundaries hold;
- provider terms/version are recorded;
- status changes are auditable.

## Gate 2 — Service area and qualification

Prove:

- provider geography is valid and deterministic;
- supported services/categories are canonical;
- qualification requirements are enforced;
- ineligible providers cannot appear for unsupported work.

## Gate 3 — Marketplace listing

Prove:

- only approved/public fields are exposed;
- private workspace/customer/payment data cannot leak;
- listing state and provider status reconcile;
- edits flow through authorized commands.

## Gate 4 — Market-cell assignment

Prove:

- provider belongs to correct market cell(s);
- geography boundaries are reproducible;
- market activation state is enforced;
- inactive/paused cells cannot receive paid demand.

## Gate 5 — Customer discovery

Prove production search/discovery for representative locations and categories:

- eligible providers appear;
- ineligible providers do not;
- empty markets are truthfully represented;
- mobile/desktop behavior passes;
- no synthetic provider data is used.

## Gate 6 — Matching and routing

Prove:

- requested service and location are honored;
- capacity/availability rules are applied;
- deterministic tie/ranking rules are auditable;
- provider selection cannot cross tenancy;
- unavailable providers are not silently routed work.

## Gate 7 — Attribution

Prove end-to-end:

Discovery -> provider exposure -> booking -> canonical appointment -> marketplace attribution.

Test:

- marketplace organic source;
- paid marketplace campaign source;
- direct shop source;
- manual source;
- unknown source;
- tampered source metadata;
- retry/replay.

Direct/manual/unknown bookings must not become marketplace-billable merely because the provider is a co-op member.

## Gate 8 — Appointment lifecycle

Prove marketplace-attributed booking survives normal Service Writer lifecycle:

book -> confirm -> schedule -> dispatch where applicable -> start -> complete -> cancel/reschedule cases.

Marketplace provenance must remain intact without corrupting normal operational state.

## Gate 9 — Payment separation

Prove:

- provider-direct customer payment uses provider-owned Stripe context;
- Service Writer takes 0% platform fee on ordinary/direct provider transactions under the applicable plan;
- marketplace attribution alone does not force Stripe Connect;
- any explicit Connect use case is separately identified and tested;
- refunds/reconciliation do not destroy marketplace provenance.

## Gate 10 — Booking-fee accrual

Prove:

- only qualifying completed marketplace bookings accrue a fee;
- configured fee amount/version is used;
- duplicates cannot accrue under webhook/command replay;
- cancellation/nonqualification blocks accrual;
- reversal/waiver produces auditable corrective ledger entries.

## Gate 11 — Co-op billing

Prove:

- recurring contribution is billed according to active membership;
- pauses/cancellations respect effective dates;
- marketplace booking-fee ledger reconciles to provider billing;
- SaaS subscription charges remain distinguishable from co-op charges.

## Gate 12 — Marketing spend ingestion

Prove:

- ad-platform spend has source IDs and time windows;
- duplicate imports are idempotent;
- currency and timezone handling are explicit;
- unavailable metrics remain unavailable rather than fabricated;
- market-level totals reconcile to source evidence.

## Gate 13 — Provider statement

Prove statement totals from source ledger rows and measured marketing data.

Required tests:

- zero-booking period;
- multiple qualifying bookings;
- reversal/adjustment;
- missing ad metric;
- provider access isolation;
- finalized-version immutability/correction path.

## Gate 14 — Marketing agent, read-only

Prove recommendations are generated from allowed evidence and never mutate campaigns.

Test capacity constraints, stale data, incomplete data, contradictory evidence, and unsupported markets.

## Gate 15 — Marketing agent execution

Separate future certification. Prove:

- approval boundaries;
- budget caps;
- max-change limits;
- idempotent external writes;
- read-back verification;
- emergency pause;
- immutable action audit;
- failure/partial-failure recovery.

Until this gate passes, agent execution remains disabled.

## Gate 16 — Security / RLS / abuse

Adversarially test:

- cross-workspace reads/writes;
- public API enumeration;
- forged marketplace attribution;
- forged completion to generate billing;
- fee replay;
- statement access;
- admin boundary;
- campaign-token/credential exposure;
- webhook forgery.

## Gate 17 — Production E2E

With real authorized test identities and controlled production-safe fixtures, prove the complete journey without relying on mocks.

Record every created object and roll it back/clean it up when appropriate.

## Gate 18 — Mobile and accessibility

Verify core customer discovery/booking and provider statement surfaces on supported mobile breakpoints, keyboard navigation, focus behavior, readable status/error states, and no blocking horizontal overflow.

## Gate 19 — Exact-SHA certification

Final GREEN packet must include:

- exact Git commit SHA;
- exact production deployment ID;
- deployment READY state;
- build/type/test results;
- production health evidence;
- runtime error-log check;
- database contract evidence;
- authenticated E2E evidence;
- security/RLS evidence;
- unresolved limitations.

Any code/document/config change after the certified SHA creates a new uncertified state until the new SHA passes the applicable release gate.
