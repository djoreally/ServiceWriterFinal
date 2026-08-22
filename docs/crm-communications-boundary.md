# CRM Communications Boundary

## Purpose

MOMS Mobile Oil Change will separate service-critical communications from relationship-marketing communications. The core application remains responsible for messages required to operate a job, appointment, payment, or customer account. The CRM is responsible for optional outreach intended to retain, reactivate, educate, reward, or sell to customers.

The boundary is a domain boundary inside the same multi-tenant platform. It is not a second database and it does not duplicate customer identities.

## Communication ownership

| Communication class | Owning domain | Examples | Operational rule |
|---|---|---|---|
| Core operational notification | Core platform | Booking confirmation, appointment reminder, technician en route, work-order status, invoice delivery, payment receipt, cancellation notice, password/security message | Must remain reliable and independent of campaigns, newsletters, loyalty, or promotional limits. |
| CRM marketing communication | CRM | Newsletter, seasonal offer, win-back campaign, oil-change reminder campaign, referral request, review request, educational email/SMS | Must pass consent, suppression, frequency, audience, and campaign checks before delivery. |
| Loyalty communication | CRM | Points balance, reward earned, reward expiration, referral credit, membership benefit | Uses loyalty rules and customer consent; never blocks core service messages. |
| Internal team alert | Core platform | Dispatch alert, technician assignment, payment exception, failed delivery alert | Separate from customer marketing preferences. |

## Shared foundation

Both domains use the same canonical `workspace_id`, `customer_id`, contact destinations, consent records, suppression rules, message log, provider adapter contract, and delivery webhook pipeline. The CRM does not create a second customer record or bypass the core messaging controls.

Every outbound message should carry an immutable purpose classification such as `operational`, `transactional`, `security`, `marketing`, or `loyalty`. The delivery policy evaluates the purpose before selecting an adapter. Marketing permissions must never be inferred from an operational interaction.

## Proposed CRM data domain

The CRM should add workspace-scoped records such as `crm_profiles`, `crm_leads`, `crm_tasks`, `crm_activities`, `crm_segments`, `crm_campaigns`, `crm_campaign_members`, `crm_loyalty_accounts`, `crm_loyalty_ledger`, and `crm_templates`. Each table must reference the canonical customer or vehicle where applicable and enforce workspace-scoped RLS.

| CRM record | Responsibility |
|---|---|
| `crm_profiles` | Lifecycle stage, lead source, preferred follow-up channel, next-action metadata, and relationship owner. |
| `crm_activities` | Calls, notes, follow-ups, campaign interactions, reviews, and customer-success history. |
| `crm_segments` | Saved audience definitions based on service history, lifecycle, vehicle age, consent, or engagement. |
| `crm_campaigns` | Campaign objective, audience, channel, schedule, template, status, and approval state. |
| `crm_campaign_members` | Immutable campaign audience snapshot and per-recipient delivery state. |
| `crm_loyalty_accounts` | Current loyalty balance and program enrollment for a canonical customer. |
| `crm_loyalty_ledger` | Append-only points and reward adjustments with source references. |

## Delivery pipeline

The core application and CRM should submit messages through a shared message-intent contract rather than calling Twilio, Resend, or another vendor directly.

```text
Domain event
  → Message intent with purpose and workspace_id
  → Consent and suppression policy
  → Template and recipient validation
  → Vendor-neutral email/SMS adapter
  → Message log
  → Delivery webhook
  → Domain activity and audit trail
```

Core notifications should use a higher operational priority and should not be blocked by CRM campaign quotas. CRM messages should support quiet hours, per-channel frequency caps, campaign pause, approval state, and unsubscribe/suppression enforcement.

## Rules that prevent entanglement

The CRM must not modify appointment status, work-order status, payment state, dispatch state, or technician workflows as a side effect of sending marketing. A campaign may create a follow-up task or a booking link, but the resulting appointment is created only through the core booking workflow.

The core platform may publish events such as `appointment_completed`, `invoice_paid`, `vehicle_service_due`, or `customer_inactive`. CRM subscribers may use those events to calculate segments or trigger campaigns, but CRM processing must be asynchronous and failure-isolated from the operational transaction.

Marketing and loyalty must be suppressible at the workspace, customer, channel, campaign, and destination levels. A customer who opts out of marketing must still receive legally or operationally necessary service communications where permitted by the applicable communication policy.

## Navigation and permissions

The CRM should be a first-class navigation area with its own dashboard, while the operational application remains focused on schedule, dispatch, technician work, vehicles, customers, invoices, and payments. Owners and authorized office/marketing users may manage CRM campaigns. Technicians should see only the customer context and service history required for the job unless explicitly granted CRM access.

All CRM routes, commands, queries, and background jobs must enforce `workspace_id` and role permissions. Campaign preview, audience export, message send, loyalty adjustment, and suppression override require separate audit events.

## Implementation sequence

1. Preserve the existing core notification and adapter contracts.
2. Add the shared message-purpose and policy evaluation model.
3. Add CRM profile, activity, segmentation, campaign, and loyalty tables with RLS.
4. Build the CRM customer profile as a projection over canonical customer, vehicle, appointment, work-order, invoice, consent, and message data.
5. Implement campaign drafts, audience snapshots, approval, scheduling, pause, and cancellation.
6. Implement loyalty ledger operations and reward audit history.
7. Add campaign and loyalty UI without changing technician or dispatch workflows.
8. Add tests for consent, suppression, workspace isolation, campaign idempotency, delivery retries, and separation between operational and marketing messages.

## Non-goals

This boundary does not create a second Supabase project, a second customer master, or a separate deployment environment. It does not make marketing a prerequisite for booking or service execution. It also does not allow a CRM campaign to send through a vendor adapter without passing the same consent, suppression, validation, and audit controls used by the rest of the platform.
