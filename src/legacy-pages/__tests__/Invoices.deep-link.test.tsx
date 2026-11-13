import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { InvoicesTab } from "@/legacy-pages/financials/Invoices";
import {
  fetchInvoiceList,
  type InvoiceListRow,
} from "@/application/queries/invoices.query";

// Item #9 Step 3 (CHAIR-1): /invoices/<id> redirects to /invoices?view=<id>;
// these tests pin how the Invoices tab consumes that param — open the
// existing InvoiceDetailDialog once the list has loaded and the id resolves,
// land plainly when it doesn't, and clear the param either way.

jest.mock("@packages/auth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

jest.mock("@/contexts/RegionalSettingsContext", () => ({
  useRegionalSettings: () => ({
    formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  }),
}));

jest.mock("@/application/queries/invoices.query", () => ({
  fetchInvoiceList: jest.fn(),
}));

jest.mock("@/components/invoices/InvoiceDetailDialog", () => ({
  InvoiceDetailDialog: (props: { invoiceId: string | null; open: boolean }) => (
    <div
      data-testid="invoice-detail-dialog"
      data-open={String(props.open)}
      data-invoice-id={props.invoiceId ?? ""}
    />
  ),
}));

jest.mock("@/components/invoices/CreateInvoiceDialog", () => ({
  CreateInvoiceDialog: () => null,
}));

const KNOWN_ID = "7c215cfc-2f4a-4c1e-9f3a-111111111111";

const row: InvoiceListRow = {
  id: KNOWN_ID,
  invoice_number: "INV-568",
  bill_to_type: "retail",
  customer_id: "cust-1",
  fleet_client_id: null,
  contact_name: null,
  issue_date: "2026-11-07",
  due_date: "2026-11-10",
  status: "past_due",
  total: 133.83,
  amount_paid: 0,
  created_at: "2026-11-07T00:00:00Z",
  customers: { name: "Cody Glenn" },
  fleet_clients: null,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderTab(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/invoices" element={<InvoicesTab />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("InvoicesTab ?view= deep link (Item #9 Step 3)", () => {
  beforeEach(() => {
    (fetchInvoiceList as jest.Mock).mockResolvedValue([row]);
  });

  it("opens the detail dialog for a known invoice id and clears the param", async () => {
    renderTab(`/invoices?view=${KNOWN_ID}`);

    const dialog = await screen.findByTestId("invoice-detail-dialog");
    await waitFor(() => expect(dialog).toHaveAttribute("data-open", "true"));
    expect(dialog).toHaveAttribute("data-invoice-id", KNOWN_ID);
    // Param consumed: refresh/back must not re-trigger the open.
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).not.toHaveTextContent("view"),
    );
  });

  it("does not open the dialog when no view param is present", async () => {
    renderTab("/invoices");

    // List has loaded (the row renders) and the dialog stays closed.
    expect(await screen.findByText("INV-568")).toBeInTheDocument();
    const dialog = screen.getByTestId("invoice-detail-dialog");
    expect(dialog).toHaveAttribute("data-open", "false");
    expect(dialog).toHaveAttribute("data-invoice-id", "");
  });

  it("lands on the plain list for an unknown id — no dialog, param cleared", async () => {
    renderTab("/invoices?view=00000000-0000-4000-8000-000000000000");

    expect(await screen.findByText("INV-568")).toBeInTheDocument();
    const dialog = screen.getByTestId("invoice-detail-dialog");
    expect(dialog).toHaveAttribute("data-open", "false");
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).not.toHaveTextContent("view"),
    );
  });
});
