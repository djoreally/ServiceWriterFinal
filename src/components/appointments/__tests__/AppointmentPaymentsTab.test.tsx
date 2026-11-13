import { render, screen, waitFor } from "@testing-library/react";
import { AppointmentPaymentsTab } from "@/components/appointments/AppointmentPaymentsTab";
import {
  fetchAppointmentPayments,
  fetchAppointmentPaymentsWithState,
  type AppointmentPaymentRow,
  type AppointmentPaymentState,
} from "@/application/queries/appointment-payments.query";

// P3 payment-state fix — the owner's screenshot is the fixture.
// Cristina / INV-106: the invoice is PAID $133.83 in full, but the tab's
// old feed (payments keyed by metadata.appointment_id only) contained
// ONLY the pending provider-sync working row, so the tab rendered
// Paid $0.00 / Pending $133.83 plus a "Payment Due" banner on a paid job
// — while the same screen's rail said "Paid in full".
//
// The mocked legacy `fetchAppointmentPayments` below reproduces that old
// feed verbatim (one pending row). The composed read
// (`fetchAppointmentPaymentsWithState`) returns both real rows plus the
// invoice-fact summary; the tab must take its summary from the
// composition, never from summing its own rows.

const APPT_ID = "94ead8b9-afc8-4061-85dc-469fb777f25f";
const INV_ID = "bb0e8400-e29b-41d4-a716-4466554400bb";
const MANUAL_PAY_ID = "cc0e8400-e29b-41d4-a716-4466554400cc";
const SYNC_PAY_ID = "dd0e8400-e29b-41d4-a716-4466554400dd";

// What the OLD query mapped from the OLD (metadata-only) server feed:
// the single pending working row, in the old DTO shape.
const legacySyncRow = {
  id: SYNC_PAY_ID,
  amount: 13383,
  subtotal: 13383,
  tax_amount: 0,
  status: "pending",
  payment_type: "pay_at_service",
  customer_email: null,
  customer_name: null,
  stripe_payment_intent_id: null,
  created_at: "2026-11-05T21:38:16Z",
  updated_at: "2026-11-05T21:38:16Z",
  invoice_sent_at: null,
} as unknown as AppointmentPaymentRow;

const manualRow: AppointmentPaymentRow = {
  id: MANUAL_PAY_ID,
  amount: 13383,
  subtotal: null,
  tax_amount: null,
  status: "succeeded",
  payment_type: "stripe",
  customer_email: "cristinalove345@gmail.com",
  customer_name: "Cristina Love",
  stripe_payment_intent_id: "ch_3UYY1nADolYVlmkJ1cRz3W1H",
  created_at: "2026-11-05T21:17:00Z",
  updated_at: "2026-11-05T21:17:00Z",
  invoice_sent_at: null,
  invoice_id: INV_ID,
  source: "manual_closeout",
  stripe_sync_status: null,
  stripe_invoice_id: null,
  payment_url: null,
};

const syncRow: AppointmentPaymentRow = {
  id: SYNC_PAY_ID,
  amount: 13383,
  subtotal: 13383,
  tax_amount: 0,
  status: "pending",
  payment_type: "pay_at_service",
  customer_email: null,
  customer_name: null,
  stripe_payment_intent_id: null,
  created_at: "2026-11-05T21:38:16Z",
  updated_at: "2026-11-05T23:30:13Z",
  invoice_sent_at: null,
  invoice_id: INV_ID,
  source: "provider_sync",
  stripe_sync_status: "synced",
  stripe_invoice_id: "in_1UYa6fAeZsMzvbynylVUnkbl",
  payment_url: "https://invoice.stripe.com/i/acct_1Sfpd/test",
};

const paidState: AppointmentPaymentState = {
  invoice_id: INV_ID,
  invoice_number: 106,
  invoice_status: "paid",
  total: 133.83,
  amount_paid: 133.83,
  balance: 0,
};

jest.mock("@/application/queries/appointment-payments.query", () => ({
  // Real module for the pure helpers (artifact rule, cent sums); only
  // the network reads are stubbed.
  ...jest.requireActual("@/application/queries/appointment-payments.query"),
  fetchAppointmentPayments: jest.fn(),
  fetchAppointmentPaymentsWithState: jest.fn(),
}));

jest.mock("@/application/commands/appointment-payments.command", () => ({
  createAppointmentPaymentRecord: jest.fn(),
  sendAppointmentPaymentLink: jest.fn(),
}));

jest.mock("@/contexts/RegionalSettingsContext", () => ({
  useRegionalSettings: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  }),
}));

jest.mock("@/components/ui/sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/payments/PaymentLinkDialog", () => ({
  PaymentLinkDialog: () => null,
}));

const mockFetchPayments = fetchAppointmentPayments as jest.Mock;
const mockFetchWithState = fetchAppointmentPaymentsWithState as jest.Mock;

function summaryBox(label: string): string {
  const labelEl = screen.getByText(label, { selector: "p" });
  return labelEl.parentElement?.textContent ?? "";
}

beforeEach(() => {
  mockFetchPayments.mockResolvedValue([legacySyncRow]);
  mockFetchWithState.mockResolvedValue({
    payments: [syncRow, manualRow],
    paymentState: paidState,
  });
});

function renderTab() {
  return render(
    <AppointmentPaymentsTab
      appointmentId={APPT_ID}
      customerEmail="cristinalove345@gmail.com"
      customerName="Cristina Love"
      isPrepaid={false}
      estimatedTotal={133.83}
    />,
  );
}

describe("AppointmentPaymentsTab — composed payment state (INV-106 fixture)", () => {
  it("shows Paid $133.83 / Pending $0.00 from the invoice composition, not row sums", async () => {
    renderTab();
    await waitFor(() => expect(summaryBox("Paid")).toContain("$133.83"));
    expect(summaryBox("Pending")).toContain("$0.00");
  });

  it("shows NO Payment Due banner on the paid job", async () => {
    renderTab();
    await waitFor(() => expect(summaryBox("Paid")).toContain("$133.83"));
    expect(screen.queryByText("Payment Due")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/send a payment link to the customer to collect payment/i),
    ).not.toBeInTheDocument();
  });

  it("lists BOTH transactions, including the manual closeout row with its charge reference", async () => {
    renderTab();
    // The charge id renders as its last 8 characters, upper-cased.
    await waitFor(() => expect(screen.getByText("1CRZ3W1H")).toBeInTheDocument());
    expect(screen.getByText("Paid", { selector: "div" })).toBeInTheDocument();
  });

  it("renders the provider-sync row as a synced Stripe artifact, with no Send Payment Link dunning action at zero balance", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText("Synced to Stripe")).toBeInTheDocument());
    expect(screen.getByText(/in_1UYa6fAeZsMzvbynylVUnkbl/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send payment link/i }),
    ).not.toBeInTheDocument();
  });

  it("still shows the Payment Due banner when the composed balance is positive", async () => {
    mockFetchWithState.mockResolvedValue({
      payments: [syncRow, manualRow],
      paymentState: { ...paidState, invoice_status: "partially_paid", amount_paid: 75, balance: 58.83 },
    });
    renderTab();
    await waitFor(() => expect(summaryBox("Pending")).toContain("$58.83"));
    expect(screen.getByText("Payment Due")).toBeInTheDocument();
  });
});
