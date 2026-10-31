import { render, screen } from "@testing-library/react";
import { PaymentStateBand } from "@/components/appointments/PaymentStateBand";

// Phase 1 payment band — renders the existing invoice facts exactly as
// they are (B5's composed payment_state does not exist yet; this band is
// its future home). One money headline, fed by the same totals the
// itemized block below it uses.

describe("PaymentStateBand", () => {
  it("shows the balance due with the invoice reference and status", () => {
    render(
      <PaymentStateBand invoiceNumber="INV-91" invoiceStatus="issued" total={267.66} amountPaid={0} balance={267.66} />,
    );
    expect(screen.getByText("Due $267.66")).toBeInTheDocument();
    expect(screen.getByText(/INV-91 · Issued/)).toBeInTheDocument();
  });

  it("shows paid in full when the balance is zero", () => {
    render(
      <PaymentStateBand invoiceNumber="INV-80" invoiceStatus="paid" total={104.94} amountPaid={104.94} balance={0} />,
    );
    expect(screen.getByText("Paid in full · $104.94")).toBeInTheDocument();
    expect(screen.getByText(/INV-80 · Paid/)).toBeInTheDocument();
  });

  it("shows the balance and the amount already paid on a partial payment", () => {
    render(
      <PaymentStateBand invoiceNumber="INV-92" invoiceStatus="partially_paid" total={200} amountPaid={75} balance={125} />,
    );
    expect(screen.getByText("Balance due $125.00")).toBeInTheDocument();
    expect(screen.getByText(/\$75\.00 paid/)).toBeInTheDocument();
  });

  it("shows the no-invoice state instead of inventing a payment state", () => {
    render(<PaymentStateBand invoiceNumber={null} invoiceStatus={null} total={0} amountPaid={0} balance={0} />);
    expect(screen.getByText("No invoice yet")).toBeInTheDocument();
  });
});
