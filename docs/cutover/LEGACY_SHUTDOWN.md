# Stage 22 legacy shutdown surface

The following legacy ServiceWriterFinal route families are intentionally fail-closed during canonical backend cutover. They return HTTP 410 from `proxy.ts` rather than continuing to mutate the retired frontend business database.

## Disabled extension route families

- `/api/v1/appointment-items`
- `/api/v1/billing`
- `/api/v1/command-center`
- `/api/v1/crm`
- `/api/v1/dispatch`
- `/api/v1/dispatch-events`
- `/api/v1/imports`
- `/api/v1/invitations`
- `/api/v1/newsletter`
- `/api/v1/reviews/actions`
- `/api/v1/workforce-identity`
- `/api/v1/payments/actions`
- `/api/v1/payments/stripe-direct`
- legacy frontend `/api/webhooks/stripe`

These are not silently removed from the product roadmap. They require a canonical domain/API implementation or an explicit adapter before they may be re-enabled.

## Canonical replacements already active

- customer/vehicle/service/work-order/appointment/invoice/payment core routes are bridged to `service-Writer-backend`.
- Stripe webhook ownership is backend Stage 19.
- Communications and provider callbacks are backend Stages 15/19.
- Public booking is backend Stage 18 plus Stage 22 compatibility adapters.

## Deeper legacy helper routes

Any Hono helper route that still touches business tables directly is not production authority. The Stage 22 cutover scanner classifies it as either:

1. shadowed by an explicit Next canonical route,
2. edge-disabled,
3. or a cutover blocker.

A blocker must be migrated or disabled before production activation.
