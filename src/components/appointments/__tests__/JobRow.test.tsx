import { render, screen } from "@testing-library/react";
import { JobRow } from "@/components/appointments/JobRow";
import type { Appointment } from "@/shared/types";

jest.mock("@/hooks/useFeeSettings", () => ({
  useFeeSettings: () => ({ feeSettings: null, loading: false }),
}));

// Phase 1 Job Row: server-composed display fields only — the customer's
// name, the vehicle · service line, the B1 tone chip (server label), and
// the job's amount due. Never a UUID, never a client-invented title.

const holmes = {
  id: "bbde8fb5-05aa-4a8d-9bcb-55db1a1d3f91",
  title: "Micheal Holmes — Sat, Oct 31 · 11:00 AM",
  display_title: "Micheal Holmes — Sat, Oct 31 · 11:00 AM",
  primary_service_name: "Full Synthetic Oil Change",
  confirmation_code: null,
  status: "confirmed",
  status_label: "Confirmed",
  status_tone: "info",
  scheduled_date: "2026-10-31",
  scheduled_time: "11:00",
  duration_minutes: 60,
  customer: { id: "c1", name: "Micheal Holmes", phone: "267-473-0643", email: "", address: "" },
  vehicle: { id: "v1", year: 2015, make: "Cadillac", model: "SRX" },
  guest_name: "Micheal Holmes",
  guest_phone: "267-473-0643",
  location_address: "5640 Chew Avenue, Philadelphia, PA 19138",
  estimated_cost: 137.28,
  source: "moms_website",
  intake_responses: { estimated_cost: 137.28, source: "moms_website" },
} as unknown as Appointment;

describe("JobRow", () => {
  it("renders the customer, vehicle · service, address and phone lines", () => {
    render(<JobRow appointment={holmes} onClick={() => undefined} />);
    expect(screen.getByText("Micheal Holmes")).toBeInTheDocument();
    expect(screen.getByText(/2015 Cadillac SRX · Full Synthetic Oil Change/)).toBeInTheDocument();
    expect(screen.getByText(/5640 Chew Avenue/)).toBeInTheDocument();
    expect(screen.getByText("267-473-0643")).toBeInTheDocument();
  });

  it("renders the server-composed status label as the chip", () => {
    render(<JobRow appointment={holmes} onClick={() => undefined} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("shows the locked website quote as the amount due, verbatim", () => {
    render(<JobRow appointment={holmes} onClick={() => undefined} />);
    expect(screen.getByText("Due $137.28")).toBeInTheDocument();
  });

  it("never renders the appointment UUID as a headline", () => {
    render(<JobRow appointment={holmes} onClick={() => undefined} />);
    expect(screen.queryByText(/bbde8fb5/)).not.toBeInTheDocument();
  });

  it("prefers the server-composed job_due over the quote fallback", () => {
    const partiallyPaid = { ...holmes, job_total: 137.28, job_due: 37.28 } as unknown as Appointment;
    render(<JobRow appointment={partiallyPaid} onClick={() => undefined} />);
    expect(screen.getByText("Due $37.28")).toBeInTheDocument();
    expect(screen.queryByText("Due $137.28")).not.toBeInTheDocument();
  });

  it("shows no amount due when the composed job_due is zero (paid in full)", () => {
    const paidInFull = { ...holmes, job_total: 137.28, job_due: 0 } as unknown as Appointment;
    render(<JobRow appointment={paidInFull} onClick={() => undefined} />);
    expect(screen.getByText("No amount due")).toBeInTheDocument();
  });
});
