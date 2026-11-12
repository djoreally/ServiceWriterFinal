import { render, screen, fireEvent } from "@testing-library/react";
import { MobileAppointmentView } from "@/components/appointments/MobileAppointmentView";
import type { Appointment, BusinessHours } from "@/shared/types";

jest.mock("@/hooks/useFeeSettings", () => ({
  useFeeSettings: () => ({ feeSettings: null, loading: false }),
}));

// Week picker contract (Ty, Nov 12): in Week view the day-number strip is
// the picker — tap a number and the list follows that day. Before the fix
// the strip only changed its own pressed state (and the fetch window):
// the list always led with Today/future days and buried past days last,
// so tapping a past day looked like nothing happened, and the status
// filter read as "overwritten by today."

const businessHours = {
  opening_time: "08:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
} as BusinessHours;

const makeAppointment = (id: string, name: string, date: string, status: string) =>
  ({
    id,
    title: `${name} — job`,
    display_title: `${name} — job`,
    primary_service_name: "Full Synthetic Oil Change",
    status,
    status_label: status.charAt(0).toUpperCase() + status.slice(1),
    status_tone: "info",
    scheduled_date: date,
    scheduled_time: "09:00",
    duration_minutes: 45,
    customer: { id: `c-${id}`, name, phone: "215-555-0100", email: "", address: "" },
    vehicle: { id: `v-${id}`, year: 2021, make: "Kia", model: "Seltos" },
    guest_name: name,
    location_address: "1 Main St",
  }) as unknown as Appointment;

// The week of Sun Nov 8 – Sat Nov 14, 2026; "today" is Thu Nov 12.
const appointments = [
  makeAppointment("a-wed", "Wed Customer", "2026-11-11", "confirmed"),
  makeAppointment("a-thu", "Thu Customer", "2026-11-12", "confirmed"),
  makeAppointment("a-fri", "Fri Customer", "2026-11-13", "cancelled"),
];

const renderWeek = (currentDate: Date, onDateChange = jest.fn()) => {
  const utils = render(
    <MobileAppointmentView
      appointments={appointments}
      businessHours={businessHours}
      onSelectAppointment={() => undefined}
      onAddAppointment={() => undefined}
      onEditAppointment={() => undefined}
      onDateChange={onDateChange}
      currentDate={currentDate}
      viewMode="week"
      onViewModeChange={() => undefined}
    />,
  );
  return { ...utils, onDateChange };
};

const groupHeadings = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("section h3")).map((h) => h.textContent ?? "");

describe("MobileAppointmentView — week day picker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-12T12:00:00"));
    // jsdom does not implement scrollTo; the week list resets its scroll
    // position when the picked day changes.
    Element.prototype.scrollTo = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("leads the week list with the picked day, even a past day", () => {
    // The state the screen is in after tapping "W 11": the anchor date
    // moved, so the list must lead with Wednesday's group — before the
    // fix Wednesday stayed buried under Today/future days.
    const { container } = renderWeek(new Date("2026-11-11T12:00:00"));
    const headings = groupHeadings(container);
    expect(headings[0]).toContain("Wed, Nov 11");
    expect(headings).toHaveLength(3);
  });

  it("strip taps ask the page to move to the tapped day", () => {
    const { container, onDateChange } = renderWeek(new Date("2026-11-12T12:00:00"));
    const friButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "F13",
    );
    expect(friButton).toBeDefined();
    fireEvent.click(friButton!);
    expect(onDateChange).toHaveBeenCalledTimes(1);
    const picked = onDateChange.mock.calls[0][0] as Date;
    expect(picked.getFullYear()).toBe(2026);
    expect(picked.getMonth()).toBe(10);
    expect(picked.getDate()).toBe(13);
  });

  it("status chips filter the week list and All restores every status", () => {
    const { container } = renderWeek(new Date("2026-11-12T12:00:00"));
    expect(screen.getByText("Fri Customer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    expect(screen.queryByText("Fri Customer")).not.toBeInTheDocument();
    expect(screen.getByText("Wed Customer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Fri Customer")).toBeInTheDocument();
    expect(container.querySelectorAll("section")).toHaveLength(3);
  });
});
