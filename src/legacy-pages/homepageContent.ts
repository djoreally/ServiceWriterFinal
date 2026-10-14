/**
 * Shared homepage copy — single source of truth for both homepage render paths:
 * - `src/legacy-pages/Homepage.tsx` (legacy SPA, in-app navigation to "/")
 * - `src/components/marketing/ServerHomepage.tsx` (App Router, server-rendered "/")
 *
 * Copy lives here so the two render paths cannot drift apart. No imports:
 * this module must stay importable from server components.
 */

export const HOMEPAGE_TITLE = "Service Writer | Run Your Shop for Free";

export const HOMEPAGE_DESCRIPTION =
  "Free automotive service software for independent shops and mobile mechanics. Run customers, vehicles, estimates, approvals, scheduling, jobs, invoices, payments, technicians, and service history without per-seat limits.";

export const HOMEPAGE_HEADLINE = "Running your shop shouldn't be the premium feature.";

export const HOMEPAGE_SUBHEAD =
  "Service Writer gives independent shops, mobile mechanics, and mobile oil change operators the operational system to run a job from customer to payment — free. No customer limits. No vehicle limits. No per-technician tax.";

export const HOMEPAGE_AUDIENCE_LINE =
  "Built for independent shops, tire shops, detailers, mobile mechanics, and mobile oil change operators.";

/**
 * Proof line. Real counts (jobs run, customers served) come from the
 * production database — they are NOT in this copy yet because the production
 * DB could not be reached with a read-only query from this environment
 * (Supabase CLI unauthenticated, no DB password or service key available).
 * Do NOT invent numbers here. When real counts are available, replace this
 * line with: "Built by MOMS Mobile Oil Change — running [X] jobs for
 * [Y] customers on it."
 */
export const HOMEPAGE_PROOF_LINE =
  "Built by MOMS Mobile Oil Change — running real jobs for real customers on it.";

export const FREE_CORE = [
  "Public booking and manual appointments",
  "Unlimited customers and vehicles",
  "VIN, notes, and service history",
  "Estimates and customer approvals",
  "Work orders and service records",
  "Invoices and payment recording",
  "Daily calendar and technician assignment",
  "Technician checklists and job status",
  "Service library and labor configuration",
  "Basic fleet customer and vehicle workflows",
  "Unlimited technicians, advisors, and admins",
  "Standard transactional emails",
];

export const VALUE_ADD = [
  "Automated service reminders",
  "Loyalty and rewards",
  "Two-way SMS and re-engagement campaigns",
  "Review generation and marketing automation",
  "AI and workflow automation",
  "Marketplace and co-op customer acquisition",
  "Route optimization and live customer tracking",
  "Advanced fleet PM and manager portal",
  "Advanced analytics, commissions, and permissions",
  "Parts and distributor integrations",
];

export const FLOW: Array<[string, string, string]> = [
  ["01", "Customer", "Create or import the customer and vehicle."],
  ["02", "Estimate", "Build the work, send it, and capture approval."],
  ["03", "Schedule", "Put approved work on the calendar and assign it."],
  ["04", "Job", "Complete the service workflow in the field or shop."],
  ["05", "Invoice", "Close the job, record payment, and retain history."],
];
