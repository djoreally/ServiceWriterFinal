# Service Writer Marketplace Blueprint

Status: PLANNED / NOT CERTIFIED

This document is the canonical product and architecture contract for the future Service Writer Marketplace Marketing Co-op. Existing marketplace code and provider-directory surfaces are not evidence that the co-op, pooled marketing program, billing, attribution, or marketing agent are operational.

## 1. Product boundary

Service Writer Marketplace is an optional demand-generation and marketing co-op for independent automotive service providers.

Providers remain independent businesses. They retain their own business identity, branding, service menus, pricing, schedules, employees/contractors, customer relationships, and merchant payment accounts.

Service Writer provides software, discovery, booking attribution, marketplace distribution, co-op marketing infrastructure, performance reporting, and eventually AI-assisted campaign operations.

Marketplace participation is separate from the core Service Writer SaaS plan.

## 2. Commercial model

The intended commercial model is:

- Core Service Writer Free: software without card-payment processing.
- Service Writer Stripe plan: flat SaaS subscription; provider connects its own Stripe account; Service Writer takes 0% of normal shop payment volume.
- Marketplace Marketing Co-op: optional fixed monthly marketing contribution, priced separately from core SaaS.
- Marketplace booking technology fee: initially modeled at $0.25 per completed marketplace-attributed booking. Final pricing remains a business configuration decision and must not be hard-coded without approval.
- Enterprise: custom flat software/commercial terms; ordinary shop payments still belong to the provider unless an explicit marketplace transaction contract says otherwise.

The co-op is not designed around a percentage commission on provider service revenue.

## 3. Payment ownership

Normal provider transactions:

Customer -> Provider Service Writer surface -> Provider-owned Stripe -> Provider

Marketplace-attributed transactions under the intended co-op model:

Marketplace discovery -> Marketplace-attributed booking -> Provider's normal Service Writer workflow -> Provider-owned Stripe -> Provider

Service Writer bills the provider separately for co-op membership and applicable fixed marketplace booking fees.

Stripe Connect remains a separate capability that may be used only where Service Writer genuinely needs platform payment orchestration, such as future marketplace deposits, split payments, centralized refunds, or other explicitly approved platform-payment use cases. Marketplace code must never silently route ordinary provider revenue through Connect.

## 4. Attribution contract

Every booking must have a canonical commercial source before payment routing or fee accrual.

Initial source taxonomy:

- direct_shop
- shop_booking_page
- marketplace
- marketplace_campaign
- fleet_direct
- manual
- repeat_customer
- unknown

`unknown` is not billable marketplace evidence. A fixed booking fee may accrue only when marketplace provenance is positively established under the attribution contract.

Marketplace attribution must preserve, where available:

- market cell
- campaign
- ad platform
- campaign/ad/ad-group identifiers
- landing page
- UTM/source metadata
- discovery/search session
- provider candidate set
- selected provider
- booking id
- completion state
- cancellation/refund state

## 5. Local market-cell model

Marketing is local first, national second.

A market cell represents a geography in which Service Writer has sufficient qualified provider supply and capacity to acquire customers responsibly. A cell may be a metro, city cluster, county group, or another controlled service geography.

A market cell should include:

- geography and service radius/coverage rules
- eligible providers
- supported service categories
- provider capacity
- open appointment supply
- historical conversion performance
- CAC/CPA performance
- campaign budget
- activation state

No paid demand generation should run in a market that cannot reliably serve the resulting demand.

## 6. Market activation gate

A market may progress through:

DRAFT -> SUPPLY_BUILDING -> READY_FOR_TEST -> LIMITED_ACQUISITION -> ACTIVE -> PAUSED

Activation must consider at minimum:

- provider density
- provider qualification
- category coverage
- service-area overlap/gaps
- near-term appointment capacity
- cancellation/completion quality
- response time
- customer-support readiness
- budget availability

The marketing agent must not be allowed to override a hard market-capacity stop.

## 7. Co-op funds

Co-op money is a restricted business-purpose pool in the product model and must be separately attributable from normal Service Writer SaaS revenue in reporting.

Initial allocation policy to model, not hard-code:

- local customer acquisition
- marketplace growth assets / SEO / creative / retargeting
- reserve and experimentation

Allocation percentages are policy/configuration, not application constants.

Provider contributions should be associated with their market cell or clearly documented pooling rules. The provider-facing statement must explain how funds were allocated; the system must never fabricate dollar-for-dollar provider-specific spend when funds were pooled.

## 8. Provider eligibility

Marketplace enrollment is optional and can be constrained by:

- service geography
- supported service categories
- capacity
- availability
- licensing/insurance/qualification requirements where applicable
- response/completion/cancellation quality
- customer experience standards

Paying a co-op fee does not guarantee a fixed number of leads, bookings, impressions, ranking, or revenue.

## 9. Matching and ranking principles

Customer-provider matching should prioritize the customer's ability to receive competent, timely service.

Potential factors include:

- service-area eligibility
- requested service capability
- vehicle compatibility
- availability/capacity
- distance/travel feasibility
- response time
- completion history
- cancellation history
- verified customer experience
- fair opportunity distribution among qualified providers

A provider must not be able to buy a guaranteed top organic marketplace position simply by increasing co-op contribution.

## 10. Provider statement

Every participating provider should eventually receive a periodic marketplace statement containing only measured data, such as:

- co-op contribution billed
- fixed marketplace booking fees
- market-cell advertising spend
- impressions/clicks where available
- marketplace profile views
- inquiries
- attributed bookings
- completed marketplace jobs
- cancellation rate
- conversion rate
- measured CAC/CPA
- attributed booking/service value where available
- capacity missed due to unavailable slots

Unknown or unavailable metrics must be shown as unavailable, never estimated and presented as fact.

## 11. Marketing agent

The future Marketplace Marketing Agent is an operations layer, not an authority that can redefine commercial policy.

It may eventually:

- analyze market supply and demand
- detect capacity constraints
- recommend/adjust campaign budgets within approved limits
- generate campaign/creative variants
- manage keywords and negatives
- monitor CAC/CPA and conversion
- identify landing-page opportunities
- identify new provider-supply needs
- detect creative fatigue and campaign anomalies
- prepare market/provider reports

Human authority remains required for:

- co-op pricing changes
- material budget-policy changes
- new-market launch approval
- brand positioning changes
- high-risk or anomalous spend
- provider disputes
- legal/compliance decisions

## 12. Public-content truth contract

Public marketplace pages may describe the intended model but must clearly distinguish live capability from planned capability.

Until co-op enrollment and marketing operations are operational, approved language includes:

- "Marketplace provider enrollment is opening soon."
- "Service Writer is building a local marketing co-op for independent automotive providers."
- "Planned co-op pricing includes a fixed monthly marketing contribution and a small completed-booking technology fee."

Do not publish fabricated provider counts, cities, booking volume, CAC, ad spend, testimonials, ROI, or launch dates.

Existing real provider-directory content may continue only when backed by actual production data.

## 13. Data and tenant boundaries

Marketplace data must preserve workspace/provider tenancy while allowing explicitly public marketplace records to be queried through safe public contracts.

No marketplace feature may weaken workspace RLS or use public exposure as justification for broad service-role access from the client.

Cross-provider analytics must be aggregated/authorized; one provider must never receive another provider's private customer, pricing, operational, payment, or campaign-detail data.

## 14. Certification status

Marketplace is NOT GREEN simply because provider directory, listing, tracking, or dashboard code exists.

The co-op is intentionally frozen at architecture/documentation and truthful public positioning until core Service Writer certification is complete.

See `MARKETPLACE_CERTIFICATION_GATES.md` for the future GREEN contract.
