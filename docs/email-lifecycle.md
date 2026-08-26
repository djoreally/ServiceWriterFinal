# Service Writer Email Lifecycle Implementation

## Evaluation

The repository already had production delivery infrastructure: `message_logs` persistence, idempotency keys, a Resend adapter, signed delivery-webhook ingestion, and a live public-booking confirmation route. However, the booking confirmation flow built its copy inline and was the only clearly implemented lifecycle sender. The new implementation preserves that delivery path while moving copy and rendering into a provider-neutral registry.

## What was implemented

| Area | Implementation |
| --- | --- |
| Lifecycle coverage | 173 approved email events across all 12 lifecycle categories in the supplied specification. |
| Copy registry | `src/server/messaging/lifecycle-templates.ts` contains stable keys, subject lines, preview text, headlines, body copy, CTA labels, essential details, and message purpose. |
| Rendering | `renderLifecycleEmail()` interpolates merge variables and produces both a provider body and a plain-text fallback. |
| Delivery | `src/server/messaging/lifecycle-sender.ts` handles lookup, idempotency, queue logging, Resend delivery, success updates, and failure updates. |
| Existing triggers | `src/server/messaging/booking-confirmation.ts` now renders the canonical booking-confirmation template through the shared dispatcher. Quote conversion and payment create/status routes now use dedicated quote/payment adapters. |
| Verification | `lifecycle-templates.test.ts` validates count, lookup, interpolation, plain-text output, and unknown-key behavior. |

## How to add a lifecycle trigger

A producer should call `sendLifecycleEmail()` with the stable registry key, recipient, workspace ID, event-specific idempotency key, and a flat variable map. For example:

```ts
await sendLifecycleEmail({
  workspaceId,
  customerId,
  recipientEmail,
  templateKey: "invoice_and_payment_sequence.payment_receipt",
  idempotencyKey: `payment-receipt:${paymentId}`,
  variables: {
    "business.name": businessName,
    "business.phone": businessPhone,
    "business.email": businessEmail,
    "invoice.number": invoiceNumber,
    "payment.amount": amount,
    "payment.receipt_number": receiptNumber,
    "email.primary_action_url": receiptUrl,
  },
  metadata: { paymentId },
});
```

The sender will reject an unknown template key, prevent duplicate sends for successful message-log entries, render the canonical subject/body, and persist delivery status using the existing `message_logs` table.

## Remaining integration work

The registry and sender are now ready for the remaining domain events. The repository does not yet expose a single event bus or a complete server-side trigger for every lifecycle event, so domain mutations still need to call the dispatcher at their authoritative state transitions. Quote-to-service conversion is wired, and payment creation/status transitions are wired for customer receipt, payment failure, and refund-state notifications. Quote creation/approval/decline and invoice creation/status events still need authoritative server endpoints or mutation hooks. The recommended order is appointment state changes, reminders, quote authorization, invoices and payments, service completion, staff events, and platform subscription events.

Reminder schedules should be dispatched by the existing background/scheduling mechanism rather than by browser code. Each workspace should resolve its own timezone and notification settings before calling the sender. Customer maintenance recommendations should only pass through variables backed by actual service records, vehicle data, or explicit workspace rules.

## Delivery and content conventions

Customer emails should render the workspace’s business identity first and include “Powered by Service Writer” in the footer. Internal emails should lead with Service Writer and identify the workspace. Required transactional receipts, invoices, security notices, and appointment updates must remain deliverable independently of marketing consent. Optional review and retention sequences should be preference-aware and should stop when the customer enters a support-recovery flow.
