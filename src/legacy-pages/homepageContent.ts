/**
 * Shared homepage copy — single source of truth for both homepage render paths:
 * - `src/legacy-pages/Homepage.tsx` (legacy SPA, in-app navigation to "/")
 * - `src/components/marketing/ServerHomepage.tsx` (App Router, server-rendered "/")
 *
 * Copy lives here so the two render paths cannot drift apart. No imports:
 * this module must stay importable from server components.
 *
 * FACTUAL BASIS (Oct 14, 2026 rewrite): every claim below is verified.
 * - Free vs paid split: `src/contexts/SubscriptionContext.tsx`
 *   `featuresFor()` — Basic (free) vs Pro vs Fleet.
 * - Prices: `src/domain/billing/canonical-pricing.ts`
 *   (Basic $0, Pro $99/mo, Fleet $299/mo, Payments add-on $99/mo).
 * - Booking, estimates, scheduling, jobs, invoices, payments, reminders:
 *   proven by production notification emails (public booking, quote
 *   approved, job assigned, invoice ready, payment received, appointment
 *   reminders) and by code (start_appointment_job_v1 RPC).
 * - Proof count: 26 real customer appointment notifications received
 *   Sep 3 – Oct 14, 2026 (28 total minus 1 test booking minus 1 self
 *   booking). Aggregate count only. No customer PII anywhere on this page.
 * - Ty runs MOMS Mobile Oil Change on Service Writer and is the only shop
 *   on it. No fake testimonials, no fake customer counts.
 * - Signup: self-serve signup does NOT produce a working workspace.
 *   `handle_new_user()` (20261010163100 migration) only inserts a
 *   profile. The only workspace_members inserts are seed + invitation
 *   acceptance. Onboarding.tsx never mentions "workspace". So the
 *   homepage must NOT promise "create your workspace" from signup.
 *   CTAs point to /contact instead, with honest copy.
 * - Estimates: "send it" is FALSE. sendQuoteEmail is an explicit stub
 *   ("Print or download the quote instead"). Flow step 02 says
 *   "Build the quote and get approval" with no send claim.
 * - Paid tiers list ONLY verified items. Removed from an earlier draft:
 *   AI assistant (no ai-assistant edge function in repo), marketing
 *   automation (rules CRUD exists, no scheduled executor), QuickBooks
 *   sync and Carfax (flagged on but unverified), and "Take cards
 *   through Stripe" (no customer card-charge path in code). The
 *   Payments add-on is described as what the 402 gate proves: it
 *   unlocks payment recording.
 * - Payments: /api/v1/payments returns 402 without the Payments add-on.
 *   Flow step 05 says "close out the job" (closeout creates invoice +
 *   payment, verified) and does not promise payment recording.
 */

export const HOMEPAGE_TITLE = "Service Writer | Run Your Shop for Free";

export const HOMEPAGE_DESCRIPTION =
  "Shop software for mobile oil change operators, shops, and mobile mechanics. Booking, estimates, scheduling, jobs, and basic invoicing. Free to start.";

export const HOMEPAGE_HEADLINE = "Run the whole job. From booking to paid.";

export const HOMEPAGE_SUBHEAD =
  "Service Writer is shop software for mobile oil change operators, shops, and mobile mechanics. Customers book online. You run the job. You send the invoice. The core is free.";

export const HOMEPAGE_AUDIENCE_LINE =
  "Built for mobile oil change operators, independent shops, tire shops, detailers, and mobile mechanics.";

export const HOMEPAGE_PROOF_LINE =
  "Built by MOMS Mobile Oil Change. One shop runs on it.";

export const HOMEPAGE_PROOF_DETAIL =
  "26 appointments came through it in the last 6 weeks. Oil changes, tire work, and details. Booked, run, and billed in the same system.";

export const FREE_CORE = [
  "Public booking page",
  "Unlimited customers, vehicles, and appointments",
  "Estimates and approvals",
  "Scheduling and calendar",
  "Start and complete jobs",
  "Basic invoicing",
  "Service catalog",
  "Appointment reminders by email",
  "Works offline on your phone",
];

export const FREE_SOLO_NOTE =
  "Free covers the owner. Pro adds seats for techs.";

export type PaidTier = { name: string; price: string; includes: string };

export const PAID_TIERS: PaidTier[] = [
  {
    name: "Pro",
    price: "$99 a month",
    includes: "Full invoicing, reports, dispatch, and technician seats.",
  },
  {
    name: "Fleet",
    price: "$299 a month",
    includes: "Everything in Pro, plus fleet vehicle records.",
  },
  {
    name: "Payments add-on",
    price: "$99 a month",
    includes: "Unlocks payment recording.",
  },
];

export const FLOW: Array<[string, string, string]> = [
  ["01", "Book", "Customers book from your page. You get the appointment."],
  ["02", "Estimate", "Build the quote and get approval."],
  ["03", "Schedule", "Put approved work on the calendar."],
  ["04", "Job", "Start the job, complete it, log the work."],
  ["05", "Invoice", "Send the invoice and close out the job."],
];
