import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import { completeAppointmentWithServiceRecord } from "@/application/commands/service-record.command";
import {
  fetchAppointmentPayments,
  fetchAppointmentPaymentsWithState,
  type AppointmentPaymentRow,
  type AppointmentPaymentState,
} from "@/application/queries/appointment-payments.query";
import type { Appointment } from "@/shared/types";

// P3 payment-state fix, test (d): a LOCKED website quote that was paid
// out-of-band (Cristina / INV-106: $133.83 collected via a direct Stripe
// link, reconciled as a manual_closeout row bound only through
// payments.invoice_id) must show $0.00 due at completion.
//
// The dialog's old already-collected read summed `fetchAppointmentPayments`
// — the metadata-only feed that contains just the PENDING provider-sync
// working row — so lockedAmountPaid stayed 0 and the dialog presented
// the full $133.83 as still due: a double-collect if the tech confirmed.

const APPT_ID = "94ead8b9-afc8-4061-85dc-469fb777f25f";
const INV_ID = "bb0e8400-e29b-41d4-a716-4466554400bb";
const MANUAL_PAY_ID = "cc0e8400-e29b-41d4-a716-4466554400cc";
const SYNC_PAY_ID = "dd0e8400-e29b-41d4-a716-4466554400dd";

const lockedAppointment = {
  id: APPT_ID,
  title: "Full Synthetic Oil Change",
  service_catalog: { name: "Full Synthetic Oil Change" },
  customer: { id: "cust-1", name: "Cristina Love" },
  customer_id: "cust-1",
  vehicle: {
    id: "veh-1",
    year: 2018,
    make: "Buick",
    model: "Encore",
    vin: "KL4CJGSB4JB648944",
    oil_type: "0W-20",
    oil_capacity: "4.2",
  },
  vehicle_id: "veh-1",
  guest_name: "Cristina Love",
  guest_email: "cristinalove345@gmail.com",
  source: "moms_website",
  intake_responses: {
    pricing_state: "website_quote_locked",
    estimated_cost: 133.83,
    client_estimated_cost: 133.83,
  },
  estimated_cost: 133.83,
  tax_amount: 0,
  status: "confirmed",
} as unknown as Appointment;

// What the OLD query mapped from the OLD (metadata-only) server feed.
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
  ...legacySyncRow,
  invoice_id: INV_ID,
  source: "provider_sync",
  stripe_sync_status: "synced",
  stripe_invoice_id: "in_1UYa6fAeZsMzvbynylVUnkbl",
  payment_url: "https://invoice.stripe.com/i/acct_1Sfpd/test",
} as AppointmentPaymentRow;

const paidState: AppointmentPaymentState = {
  invoice_id: INV_ID,
  invoice_number: 106,
  invoice_status: "paid",
  total: 133.83,
  amount_paid: 133.83,
  balance: 0,
};

jest.mock("@/application/queries/appointment-payments.query", () => ({
  // Real module for the pure helpers; only the network reads are stubbed.
  ...jest.requireActual("@/application/queries/appointment-payments.query"),
  fetchAppointmentPayments: jest.fn(),
  fetchAppointmentPaymentsWithState: jest.fn(),
}));

jest.mock("@/application/queries/vehicle-specifications.query", () => ({
  fetchVehicleSpecifications: jest.fn(async () => []),
}));

jest.mock("@/application/commands/service-record.command", () => ({
  completeAppointmentWithServiceRecord: jest.fn(),
}));

jest.mock("@/application/commands/vehicles.command", () => ({
  updateVehicleOilType: jest.fn(),
}));

jest.mock("@/application/commands/appointment-payments.command", () => ({
  createAppointmentPaymentRecord: jest.fn(),
  sendAppointmentPaymentLink: jest.fn(),
}));

jest.mock("@/hooks/useFeeSettings", () => ({
  useFeeSettings: () => ({ feeSettings: null, isLoading: false }),
}));

jest.mock("@/contexts/TerminologyContext", () => ({
  useTerminology: () => ({
    terms: { service: "Service", customer: "Customer", vehicle: "Vehicle" },
  }),
}));

jest.mock("@/contexts/RegionalSettingsContext", () => ({
  useRegionalSettings: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  }),
}));

jest.mock("@/components/ui/sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/payments/ManualPaymentDialog", () => ({
  ManualPaymentDialog: () => null,
}));

jest.mock("@/components/payments/PaymentLinkDialog", () => ({
  PaymentLinkDialog: () => null,
}));

const mockFetchPayments = fetchAppointmentPayments as jest.Mock;
const mockFetchWithState = fetchAppointmentPaymentsWithState as jest.Mock;

function totalRowText(): string {
  return screen.getByText("Total:").parentElement?.textContent ?? "";
}

beforeEach(() => {
  mockFetchPayments.mockResolvedValue([legacySyncRow]);
});

describe("CompleteAppointmentDialog — locked quote paid out-of-band (INV-106)", () => {
  it("shows $0.00 due when the invoice composition says the locked quote was already collected", async () => {
    mockFetchWithState.mockResolvedValue({
      payments: [syncRow, manualRow],
      paymentState: paidState,
    });
    render(
      <CompleteAppointmentDialog
        appointment={lockedAppointment}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => expect(totalRowText()).toContain("$0.00"));
    expect(totalRowText()).not.toContain("$133.83");
  });

  it("still credits the out-of-band payment when the job has no invoice (succeeded-row fallback over the widened feed)", async () => {
    mockFetchWithState.mockResolvedValue({
      payments: [syncRow, manualRow],
      paymentState: null,
    });
    render(
      <CompleteAppointmentDialog
        appointment={lockedAppointment}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => expect(totalRowText()).toContain("$0.00"));
  });

  it("keeps the full locked quote as due when nothing was collected", async () => {
    mockFetchWithState.mockResolvedValue({ payments: [], paymentState: null });
    render(
      <CompleteAppointmentDialog
        appointment={lockedAppointment}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => expect(totalRowText()).toContain("$133.83"));
  });
});

// Cycle 4 regression: the dialog's mileage gate was
// `!formData.mileage || parseInt(formData.mileage) <= 0`, which rejected
// a legitimate ending mileage of 0 as "required" (a real closeout had
// to be falsified to 1 to proceed). Empty stays invalid; 0 is valid.
describe("CompleteAppointmentDialog — ending mileage validation", () => {
  const mockComplete = completeAppointmentWithServiceRecord as jest.Mock;

  beforeEach(() => {
    mockFetchWithState.mockResolvedValue({ payments: [], paymentState: null });
    mockComplete.mockResolvedValue({ success: true, serviceId: "svc-1" });
  });

  function renderDialog() {
    render(
      <CompleteAppointmentDialog
        appointment={lockedAppointment}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    return {
      mileageInput: screen.getByPlaceholderText("Enter mileage"),
      completeButton: screen.getByRole("button", { name: /Complete & Create Record/ }),
    };
  }

  it("accepts an ending mileage of 0 and submits it as 0", async () => {
    const { mileageInput, completeButton } = renderDialog();
    fireEvent.change(mileageInput, { target: { value: "0" } });
    fireEvent.click(completeButton);
    await waitFor(() =>
      expect(mockComplete).toHaveBeenCalledWith(
        APPT_ID,
        expect.objectContaining({ mileage: 0 }),
      ),
    );
    expect(screen.queryByText("Ending mileage is required")).toBeNull();
  });

  it("rejects an empty ending mileage and does not complete", async () => {
    const { completeButton } = renderDialog();
    fireEvent.click(completeButton);
    expect(await screen.findByText("Ending mileage is required")).toBeTruthy();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("accepts a normal ending mileage", async () => {
    const { mileageInput, completeButton } = renderDialog();
    fireEvent.change(mileageInput, { target: { value: "45210" } });
    fireEvent.click(completeButton);
    await waitFor(() =>
      expect(mockComplete).toHaveBeenCalledWith(
        APPT_ID,
        expect.objectContaining({ mileage: 45210 }),
      ),
    );
  });
});
