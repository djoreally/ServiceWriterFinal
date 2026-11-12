import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvoiceDetailDialog } from "@/components/invoices/InvoiceDetailDialog";
import { fetchInvoiceDetail, type InvoiceFullRow } from "@/application/queries/invoices.query";
import { recordFleetInvoicePayment } from "@/application/commands/invoices.command";

// Restored record-payment behavior: the invoice payment dialog once
// carried only an amount and a note, while the manual-payment flow it
// was bridged from recorded the payment method (cash / check /
// external_card / other) and could waive the card processing fee
// (ManualPaymentDialog; fee waiver added 2026-09-18 in f3493e351, lost
// from the dialog surface afterwards). These tests pin the restored
// contract: submitting the dialog sends the method and the fee waiver
// with the payment, and the amount follows the waived balance.

jest.mock("@/application/queries/invoices.query", () => ({
  fetchInvoiceDetail: jest.fn(),
}));
jest.mock("@/application/commands/invoices.command", () => ({
  recordFleetInvoicePayment: jest.fn(),
  deleteInvoice: jest.fn(),
}));
jest.mock("@/components/invoices/SendInvoiceDialog", () => ({
  SendInvoiceDialog: () => null,
}));
jest.mock("@/contexts/RegionalSettingsContext", () => ({
  useRegionalSettings: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  }),
}));
jest.mock("@/components/ui/sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const INVOICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";

function makeInvoice(overrides: Partial<InvoiceFullRow> = {}): InvoiceFullRow {
  return {
    id: INVOICE_ID,
    invoice_number: "INV-104",
    bill_to_type: "retail",
    customer_id: "cust-1",
    fleet_client_id: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    issue_date: "2026-11-04",
    due_date: "2026-11-12",
    payment_terms: null,
    status: "sent",
    notes: null,
    terms_text: null,
    subtotal: 123.5,
    discount_type: "fixed",
    discount_amount: 0,
    tax_enabled: false,
    tax_rate: 0,
    tax_amount: 0,
    waste_oil_fee_enabled: false,
    waste_oil_fee: 0,
    shop_fee_enabled: false,
    shop_fee: 0,
    surcharge_enabled: true,
    surcharge: 3.5,
    total: 123.5,
    amount_paid: 0,
    sent_at: null,
    delivery_status: "not_configured",
    delivery_last_error: null,
    delivery_attempt_count: 0,
    last_delivery_attempt_at: null,
    customers: { id: "cust-1", name: "Dave Hamilton", email: "dave@atlanticice.com", phone: null, address: null },
    fleet_clients: null,
    invoice_line_items: [
      {
        id: "li-1",
        invoice_id: INVOICE_ID,
        vehicle_id: null,
        service_catalog_id: null,
        description: "Oil Change Service",
        quantity: 1,
        unit_price: 123.5,
        line_total: 123.5,
        display_order: 0,
        fee_key: null,
        source: null,
        vin: null,
        vehicle_year: null,
        vehicle_make: null,
        vehicle_model: null,
        vehicle_trim: null,
        vehicle_engine: null,
        oil_type: null,
        oil_capacity: null,
        oil_filter: null,
      },
    ],
    ...overrides,
  };
}

const fetchInvoiceDetailMock = fetchInvoiceDetail as jest.Mock;
const recordPaymentMock = recordFleetInvoicePayment as jest.Mock;

async function openPaymentDialog() {
  render(<InvoiceDetailDialog invoiceId={INVOICE_ID} open onOpenChange={() => undefined} />);
  await screen.findByText("INV-104");
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  await screen.findByText("Record invoice payment");
}

function submitPayment() {
  const buttons = screen.getAllByRole("button", { name: "Record payment" });
  fireEvent.click(buttons[buttons.length - 1]);
}

beforeEach(() => {
  recordPaymentMock.mockResolvedValue({ status: "paid", amount_paid: 120, balance_due: 0 });
});

describe("InvoiceDetailDialog record payment", () => {
  it("submits the payment method and the waived card fee with the payment", async () => {
    fetchInvoiceDetailMock.mockResolvedValue(makeInvoice());
    await openPaymentDialog();

    // Method selector is present and defaults to Cash, as in the
    // manual-payment dialog.
    expect(screen.getByLabelText("Payment method")).toHaveTextContent("Cash");

    // Waiving the card fee drops the recorded amount to the
    // fee-waived balance: $123.50 - $3.50 = $120.00.
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(amountInput.value).toBe("123.50");
    fireEvent.click(screen.getByLabelText(/Waive card processing fee/));
    expect(amountInput.value).toBe("120.00");

    submitPayment();

    await waitFor(() =>
      expect(recordPaymentMock).toHaveBeenCalledWith({
        invoiceId: INVOICE_ID,
        amount: 120,
        note: undefined,
        paymentMethod: "cash",
        waiveFees: true,
      }),
    );
  });

  it("records a plain full-balance payment with no waiver when the box is left unchecked", async () => {
    fetchInvoiceDetailMock.mockResolvedValue(makeInvoice());
    await openPaymentDialog();

    submitPayment();

    await waitFor(() =>
      expect(recordPaymentMock).toHaveBeenCalledWith({
        invoiceId: INVOICE_ID,
        amount: 123.5,
        note: undefined,
        paymentMethod: "cash",
        waiveFees: false,
      }),
    );
  });

  it("offers no fee waiver when the invoice carries no card surcharge", async () => {
    fetchInvoiceDetailMock.mockResolvedValue(
      makeInvoice({ surcharge_enabled: false, surcharge: 0 }),
    );
    await openPaymentDialog();

    expect(screen.queryByLabelText(/Waive card processing fee/)).toBeNull();

    submitPayment();

    await waitFor(() =>
      expect(recordPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 123.5, waiveFees: false }),
      ),
    );
  });
});
