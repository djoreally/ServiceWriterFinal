import { fireEvent, render, screen } from "@testing-library/react";
import { AppointmentTray } from "@/components/appointments/AppointmentTray";
import type { Appointment } from "@/shared/types";

jest.mock("@/hooks/useFeeSettings", () => ({
  useFeeSettings: () => ({ feeSettings: null, loading: false }),
}));

// The tray's contract is the summary + the exits; the lifecycle button and
// the edit dialog carry their own suites, so they are stubbed here.
jest.mock("@/components/appointments/JobActionButton", () => ({
  JobActionButton: () => <div data-testid="job-action" />,
}));
jest.mock("@/components/appointments/EditAppointmentDialog", () => ({
  EditAppointmentDialog: () => null,
}));

// Same fixture family as JobRow.test.tsx: server-composed display fields.
const holmes = {
  id: "bbde8fb5-05aa-4a8d-9bcb-55db1a1d3f91",
  title: "Micheal Holmes — Sat, Oct 31 · 11:00 AM",
  display_title: "Micheal Holmes — Sat, Oct 31 · 11:00 AM",
  primary_service_name: "Full Synthetic Oil Change",
  confirmation_code: "ABC123",
  status: "confirmed",
  status_label: "Confirmed",
  status_tone: "info",
  scheduled_date: "2026-10-31",
  scheduled_time: "11:00",
  duration_minutes: 60,
  customer: { id: "c1", name: "Micheal Holmes", phone: "2674730643", email: "holmes@example.com", address: "" },
  vehicle: { id: "v1", year: 2015, make: "Cadillac", model: "SRX" },
  guest_name: "Micheal Holmes",
  guest_phone: "2674730643",
  location_address: "5640 Chew Avenue, Philadelphia, PA 19138",
  estimated_cost: 137.28,
  source: "moms_website",
  intake_responses: { estimated_cost: 137.28, source: "moms_website" },
} as unknown as Appointment;

describe("AppointmentTray", () => {
  it("renders the job summary: customer, dashed phone, vehicle · service, address", () => {
    render(
      <AppointmentTray appointment={holmes} onOpenChange={() => undefined} onOpenFullRecord={() => undefined} onChanged={() => undefined} />,
    );
    expect(screen.getByText("Micheal Holmes")).toBeInTheDocument();
    expect(screen.getByText("267-473-0643")).toBeInTheDocument();
    expect(screen.getByText("2015 Cadillac SRX")).toBeInTheDocument();
    expect(screen.getByText("Full Synthetic Oil Change")).toBeInTheDocument();
    expect(screen.getByText(/5640 Chew Avenue/)).toBeInTheDocument();
    expect(screen.getByTestId("job-action")).toBeInTheDocument();
  });

  it("shows the locked website quote as the amount due", () => {
    render(
      <AppointmentTray appointment={holmes} onOpenChange={() => undefined} onOpenFullRecord={() => undefined} onChanged={() => undefined} />,
    );
    expect(screen.getByText("Due $137.28")).toBeInTheDocument();
  });

  it("prefers the server-composed job_due and reads zero as no amount due", () => {
    const paid = { ...holmes, job_total: 137.28, job_due: 0 } as unknown as Appointment;
    render(
      <AppointmentTray appointment={paid} onOpenChange={() => undefined} onOpenFullRecord={() => undefined} onChanged={() => undefined} />,
    );
    expect(screen.getByText("No amount due")).toBeInTheDocument();
  });

  it("opens the full record one tap deeper", () => {
    const onOpenFullRecord = jest.fn();
    render(
      <AppointmentTray appointment={holmes} onOpenChange={() => undefined} onOpenFullRecord={onOpenFullRecord} onChanged={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open full record/i }));
    expect(onOpenFullRecord).toHaveBeenCalledWith(holmes);
  });

  it("renders nothing open without an appointment", () => {
    render(
      <AppointmentTray appointment={null} onOpenChange={() => undefined} onOpenFullRecord={() => undefined} onChanged={() => undefined} />,
    );
    expect(screen.queryByText("Micheal Holmes")).not.toBeInTheDocument();
  });
});
