/**
 * Schema contract for the tech-app payment doors (pay-by-link + cash
 * on the spot, 2026-11-12): GET /v1/tech-app/payment, POST
 * /v1/tech-app/payment/send, POST /v1/tech-app/payment/customer-email
 * and POST /v1/tech-app/payment/cash in
 * src/server/hono/routes/work-orders.ts.
 *
 * The doors serve a technician ONLY their own assigned job's payment
 * state and run the canonical machinery for it. Mocked-supabase
 * tests cannot see a door that drops its assignment scope or invents
 * its own Stripe call, so — same guard style as
 * tech-app-jobs-selects.test.ts — the handler source is pinned:
 * - each route registers exactly once,
 * - the job resolves through the caller's workspace + assigned_user_id,
 * - invoice/payment resolution keys on the canonical links
 *   (invoices.metadata->>'appointment_id', payments.invoice_id,
 *   payments.metadata @> appointment_id),
 * - the send runs ONLY the canonical machinery (Stripe invoice sync +
 *   payment-requested lifecycle) behind the Payments add-on gate,
 * - the email correction writes ONLY customers.email, workspace-scoped,
 * - the cash record runs ONLY the canonical manual_payment closeout
 *   shape behind the same gate, takes no amount input (cash settles
 *   in full — a partial must be impossible to express), and has no
 *   waive path.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/work-orders.ts"),
  "utf8",
);

function block(from: string, to?: string): string {
  const start = SOURCE.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start);
  if (!to) return rest;
  const end = rest.indexOf(to, 10);
  return end === -1 ? rest : rest.slice(0, end);
}

const RESOLVER = () => block("async function resolveTechJobPayment", "workOrdersRouter.get(\"/v1/tech-app/payment\"");
const GET_BLOCK = () => block('workOrdersRouter.get("/v1/tech-app/payment"', 'workOrdersRouter.post("/v1/tech-app/payment/send"');
const SEND_BLOCK = () => block('workOrdersRouter.post("/v1/tech-app/payment/send"', 'workOrdersRouter.post("/v1/tech-app/payment/customer-email"');
const EMAIL_BLOCK = () => block('workOrdersRouter.post("/v1/tech-app/payment/customer-email"', 'workOrdersRouter.post("/v1/tech-app/payment/cash"');
const CASH_BLOCK = () => block('workOrdersRouter.post("/v1/tech-app/payment/cash"', 'workOrdersRouter.get("/v1/tech-app/sync/pull"');

describe("tech-app payment door — registration", () => {
  it("registers each route exactly once", () => {
    expect(SOURCE.match(/workOrdersRouter\.get\("\/v1\/tech-app\/payment"/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/workOrdersRouter\.post\("\/v1\/tech-app\/payment\/send"/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/workOrdersRouter\.post\("\/v1\/tech-app\/payment\/customer-email"/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/workOrdersRouter\.post\("\/v1\/tech-app\/payment\/cash"/g) ?? []).toHaveLength(1);
  });
});

describe("tech-app payment door — job resolution scope", () => {
  it("resolves the caller's workspace before reading", () => {
    expect(GET_BLOCK()).toContain("requireCallerWorkspaceId(c)");
    expect(SEND_BLOCK()).toContain("requireCallerWorkspaceId(c)");
    expect(EMAIL_BLOCK()).toContain("requireCallerWorkspaceId(c)");
    expect(CASH_BLOCK()).toContain("requireCallerWorkspaceId(c)");
  });

  it("keys the job on the caller's workspace and their own assignment", () => {
    const resolver = RESOLVER();
    expect(resolver).toContain('.eq("workspace_id", workspaceId)');
    expect(resolver).toContain('.eq("assigned_user_id", userId)');
    expect(resolver).not.toContain('.eq("user_id"');
  });

  it("resolves invoice + payment through the canonical links only", () => {
    const resolver = RESOLVER();
    expect(resolver).toContain('.eq("metadata->>appointment_id", jobId)');
    expect(resolver).toContain('.neq("status", "void")');
    expect(resolver).toContain('.eq("invoice_id", invoice.id)');
    expect(resolver).toContain('.contains("metadata", { appointment_id: jobId })');
  });

  it("404s a job that is not the caller's instead of leaking it", () => {
    expect(RESOLVER()).toContain('new ApiError(404, "Job not found", "job_not_found")');
  });
});

describe("tech-app payment door — the send", () => {
  it("sits behind the canonical Payments add-on gate", () => {
    expect(SEND_BLOCK()).toContain("requireWorkspacePaymentsAddonAuth(c, workspaceId)");
  });

  it("runs only the canonical send machinery — no local Stripe calls", () => {
    const send = SEND_BLOCK();
    expect(send).toContain("syncCanonicalInvoiceToStripe({");
    expect(send).toContain("dispatchPaymentLifecycle({");
    expect(send).toContain("LIFECYCLE_EVENT_KEYS.paymentRequested");
    expect(send).not.toContain("new Stripe(");
    expect(send).not.toContain("stripe.invoices");
    expect(send).not.toContain("paymentLinks.create");
  });

  it("refuses an already-paid job and a job with no invoice", () => {
    const send = SEND_BLOCK();
    expect(send).toContain('"already_paid"');
    expect(send).toContain('"invoice_required"');
    expect(send).toContain('"customer_email_required"');
  });

  it("derives every reported state through the shared derivation", () => {
    expect(GET_BLOCK()).toContain("deriveTechJobPaymentState({");
    expect(SEND_BLOCK()).toContain("deriveTechJobPaymentState({");
  });
});

describe("tech-app payment door — email correction", () => {
  it("validates the address and writes only customers.email, workspace-scoped", () => {
    const email = EMAIL_BLOCK();
    expect(email).toContain("z.string().trim().email()");
    expect(email).toContain('.from("customers")');
    expect(email).toContain(".update({ email: body.email })");
    expect(email).toContain('.eq("workspace_id", workspaceId)');
  });
});

describe("tech-app payment door — cash on the spot", () => {
  it("resolves the job through the same assignment-scoped resolver (another tech's job 404s)", () => {
    const cash = CASH_BLOCK();
    expect(cash).toContain("resolveTechJobPayment(supabase, workspaceId, user.id, body.job_id)");
    expect(cash).toContain("deriveTechJobPaymentState({");
  });

  it("sits behind the canonical Payments add-on gate", () => {
    expect(CASH_BLOCK()).toContain("requireWorkspacePaymentsAddonAuth(c, workspaceId)");
  });

  it("takes no amount input — a partial cash payment cannot be expressed", () => {
    const cash = CASH_BLOCK();
    expect(cash).toContain("z.object({ job_id: z.string().min(1) })");
    expect(cash).not.toContain("body.amount");
    expect(cash).not.toContain("waive");
  });

  it("refuses an already-paid job, a job with no invoice, and a job with nothing due", () => {
    const cash = CASH_BLOCK();
    expect(cash).toContain('"already_paid"');
    expect(cash).toContain('"invoice_required"');
    expect(cash).toContain('"invalid_payment_state"');
    expect(cash).toContain('"nothing_due"');
    expect(cash).toContain('"amount_unavailable"');
  });

  it("records exactly the derived full due, never a caller-supplied figure", () => {
    const cash = CASH_BLOCK();
    expect(cash).toContain("const amountDue = state.amount_due;");
    expect(cash).toContain("amount: amountDue,");
  });

  it("settles the canonical receivable row in the office closeout's own shape", () => {
    const cash = CASH_BLOCK();
    expect(cash).toContain("markStripeInvoicePaidOutOfBand({");
    expect(cash).toContain('status: "succeeded"');
    expect(cash).toContain('provider: "other"');
    expect(cash).toContain("paid_at: paidAt");
    expect(cash).toContain('payment_method: "cash"');
    expect(cash).toContain("recorded_manually: true");
    expect(cash).toContain("received_in_person: true");
    expect(cash).toContain("stripe_out_of_band_sync_status: stripeSync.status");
    expect(cash).not.toContain("new Stripe(");
    expect(cash).not.toContain("stripe.invoices");
  });
});
