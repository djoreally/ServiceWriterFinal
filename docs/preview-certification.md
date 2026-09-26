# Clean Preview Certification

This document is the deployment contract for the clean Service Writer application.

## Isolation rule

Do **not** repoint or modify the existing Vercel project `servicewriter.xyx`.

That project is linked to:

- GitHub repository: `djoreally/ServiceWriterFinal`
- production application: current legacy Service Writer

The clean application source is:

- GitHub repository: `djoreally/service-Writer-backend`
- branch: `service-writer-clean-foundation`

Create a separate Vercel project for certification.

Recommended project name:

`service-writer-clean-preview`

## Framework/runtime

- Framework: Next.js
- Node.js: 24.x
- Root directory: repository root
- Install command: `npm ci`
- Build command: `npm run build`
- Output: standard Next.js output

The repository `package.json` declares Node `>=24 <25`.

## Required preview environment

Use the existing Service Writer infrastructure. Never copy these values into browser-exposed variables except the two public Supabase identity values.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `SERVICE_WRITER_WEB_ORIGINS`

Set `SERVICE_WRITER_WEB_ORIGINS` to the isolated preview origin. Do not reuse production browser origins as a shortcut.

## Hard build gate

Before browser testing, run:

```bash
bash scripts/certify-preview.sh
```

The preview is blocked unless all five gates pass:

1. `npm ci`
2. `npm run verify:boundaries`
3. `npm run typecheck`
4. `npm run lint`
5. `npm run build`

The terminal must end with:

`CERTIFICATION_BUILD_GREEN`

## Readiness smoke check

After deployment:

`GET /api/v1/readiness`

Expected:

- HTTP 200
- service status `ready`
- database status `ready`

A 503 blocks certification.

## Browser certification

Run the following only on the isolated preview:

1. Login
2. Open dashboard
3. Customers list/create
4. Vehicles list/create
5. Service Catalog list/create
6. Staff appointment create
7. Public booking create
8. Convert appointment to work order
9. Start job
10. Complete required inspection
11. Complete job
12. Create quote
13. Send quote
14. Approve quote
15. Issue invoice
16. Start hosted Stripe Checkout when a connected Stripe account exists
17. Verify signed webhook records payment
18. Verify invoice changes to paid only from webhook settlement
19. Verify outbox delivery / email notification
20. Confirm another workspace cannot access the created records

## Notification certification

Do not treat redirect/success-page state as proof of notification delivery.

Verify:

- `domain_events` row exists
- `event_deliveries` transitions to `completed`
- `event_consumer_executions` records the email consumer
- provider reference is stored
- retrying the same event does not create a second logical send

## Cutover prohibition

Do not merge PR #1, assign production domains, or promote this project while any of these remain red:

- install
- boundaries
- typecheck
- lint
- build
- readiness
- tenant isolation
- booking lifecycle
- inspection gate
- invoice/payment webhook
- notification delivery

Production stays on `ServiceWriterFinal` until this document is fully green.
