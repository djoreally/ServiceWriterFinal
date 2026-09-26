# Payment Provider Boundary

Payment state enters Service Writer through a verified server-side provider adapter.

## Required sequence

1. Receive the provider callback as raw HTTP.
2. Verify the provider signature/authenticity **before parsing it as trusted payment state**.
3. Normalize the provider-specific payload into the internal successful-payment command.
4. Use the provider's immutable payment/transaction ID for deduplication.
5. Lock the invoice inside the transaction.
6. Reject overpayment or payment against a void invoice.
7. Insert the payment, update invoice settlement state, and publish `payment.succeeded` atomically.
8. A repeated provider callback returns the existing payment rather than applying the amount again.

## Provider adapters

Stripe, Square, PayPal or another provider may have different signature schemes and event models. Provider SDK objects do not belong in the application/domain command. The adapter translates them into:

```ts
{
  workspaceId,
  invoiceId,
  provider,
  providerPaymentId,
  amount,
  currencyCode,
  paidAt,
  idempotencyKey
}
```

Do not expose a generic public endpoint that lets a browser assert `payment.succeeded`.

## Money

Provider amounts must be normalized exactly from their integer-minor-unit representation where available. Never convert a provider's integer cents through binary floating point and then treat the result as authoritative.

## Failure states

A verified provider failure may be recorded separately, but it must never reduce or increase invoice `amount_paid`.

Refunds are separate explicit commands. Do not model a refund as a negative successful payment.

## Current provider implementation status

The clean backend currently contains **no concrete Stripe or Square webhook adapter** and no provider credentials in source. That is intentional. The provider-neutral settlement command is implemented first; a provider adapter is added only after its account/configuration contract is known and its signature verification can be implemented and tested.

Do not infer that installing an SDK means a provider is configured. Do not add a webhook route that accepts unsigned JSON merely to make local development easier.

## Service Writer Stripe decision

The connected Stripe session includes a dedicated **Service Writer** account. The integration is prepared against that platform context, but account mutations and live charges are not part of backend construction.

Service Writer is modeled as a **vertical SaaS platform**, not as the merchant selling each repair. A shop accepts payment from its own customer. The Stripe architecture therefore uses Connect direct charges for shop payments, with the shop/connected account as merchant of record. Where configured, Service Writer can collect an application fee.

Important consequences:

- PaymentIntent/Charge objects for direct charges live on the connected account.
- Server API requests for those objects must carry the connected account context.
- Webhook processing, not browser redirects, is authoritative for successful settlement.
- The platform must retain a durable mapping from Service Writer workspace to Stripe connected account ID.
- Before charging, the backend verifies the connected account is enabled for card payments.
- Provider amounts enter Service Writer as integer minor units and are converted to database decimal strings without floating-point arithmetic.
- Stripe API keys and webhook secrets are runtime/CI secrets. They are never committed.
- A webhook endpoint secret is environment-specific. A CLI forwarding secret must not be confused with a Dashboard endpoint secret.

No public deployment URL is required yet. Webhook route code can be built and tested with signed fixtures/Stripe CLI once the executable CI environment is connected.

## Local Stripe CLI workflow

Stripe CLI is external developer tooling and is intentionally separate from the Stripe Node SDK.

After authenticating the CLI to the intended Stripe account, local webhook development uses:

`npm run stripe:listen`

This forwards Stripe events to:

`http://localhost:3000/api/v1/webhooks/stripe`

The CLI prints an ephemeral `whsec_...` signing secret for that forwarding session. Supply it to the local process as `STRIPE_WEBHOOK_SECRET`; never commit it and never reuse it as a deployed endpoint secret.

A convenience fixture command is available as `npm run stripe:trigger:payment-succeeded`. Fixture events are development evidence only and must not be confused with a real customer payment.

