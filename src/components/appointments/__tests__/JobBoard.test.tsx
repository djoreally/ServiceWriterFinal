import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  JobBoard,
  boardColumnForStatus,
  forwardColumns,
  groupBoardAppointments,
} from "@/components/appointments/JobBoard";
import { combineDateAndTime } from "@/lib/datetime";
import type { Appointment } from "@/shared/types";

jest.mock("@/hooks/useFeeSettings", () => ({
  useFeeSettings: () => ({ feeSettings: null, loading: false }),
}));

const base = {
  title: "Job",
  display_title: "Job",
  primary_service_name: "Full Synthetic Oil Change",
  confirmation_code: null,
  scheduled_date: "2026-10-31",
  scheduled_time: "11:00",
  duration_minutes: 60,
  vehicle: { id: "v1", year: 2015, make: "Cadillac", model: "SRX" },
  location_address: "5640 Chew Avenue, Philadelphia, PA 19138",
  estimated_cost: 100,
  source: "admin",
} as unknown as Appointment;

function job(id: string, status: string, time: string, name: string): Appointment {
  return {
    ...base,
    id,
    status,
    scheduled_time: time,
    customer: { id: `c-${id}`, name, phone: "267-473-0643", email: "", address: "" },
    guest_name: name,
    guest_phone: "267-473-0643",
  } as unknown as Appointment;
}

const day = combineDateAndTime("2026-10-31", null) as Date;

describe("boardColumnForStatus", () => {
  it("maps the canonical lifecycle onto the four columns", () => {
    expect(boardColumnForStatus("confirmed")).toBe("booked");
    expect(boardColumnForStatus("assigned")).toBe("booked");
    expect(boardColumnForStatus("en_route")).toBe("rolling");
    expect(boardColumnForStatus("arrived")).toBe("rolling");
    expect(boardColumnForStatus("in_progress")).toBe("working");
    expect(boardColumnForStatus("completed")).toBe("done");
  });

  it("accepts the stored aliases and keeps dead statuses off the board", () => {
    expect(boardColumnForStatus("on_the_way")).toBe("rolling");
    expect(boardColumnForStatus("started")).toBe("working");
    expect(boardColumnForStatus("complete")).toBe("done");
    expect(boardColumnForStatus("cancelled")).toBeNull();
    expect(boardColumnForStatus("no_show")).toBeNull();
    expect(boardColumnForStatus(undefined)).toBeNull();
  });

  it("moves are forward-only", () => {
    expect(forwardColumns("booked")).toEqual(["rolling", "working", "done"]);
    expect(forwardColumns("rolling")).toEqual(["working", "done"]);
    expect(forwardColumns("working")).toEqual(["done"]);
    expect(forwardColumns("done")).toEqual([]);
  });
});

describe("groupBoardAppointments", () => {
  it("buckets by column and sorts by start time inside a column", () => {
    const groups = groupBoardAppointments([
      job("1", "confirmed", "13:00", "Late"),
      job("2", "confirmed", "09:00", "Early"),
      job("3", "en_route", "10:00", "Rolling"),
      job("4", "cancelled", "08:00", "Dead"),
    ]);
    expect(groups.booked.map((a) => a.id)).toEqual(["2", "1"]);
    expect(groups.rolling.map((a) => a.id)).toEqual(["3"]);
    expect(groups.working).toEqual([]);
    expect(groups.done).toEqual([]);
  });
});

describe("JobBoard", () => {
  it("renders the day's jobs in their columns and leaves cancelled jobs off", () => {
    render(
      <JobBoard
        appointments={[
          job("1", "confirmed", "09:00", "Booked Beth"),
          job("2", "in_progress", "10:00", "Working Walt"),
          job("3", "completed", "08:00", "Done Dana"),
          job("4", "cancelled", "07:00", "Cancelled Carl"),
        ]}
        currentDate={day}
        onSelectAppointment={() => undefined}
        onStatusChange={() => undefined}
        onCompleteAppointment={() => undefined}
      />,
    );
    expect(within(screen.getByRole("region", { name: "Booked" })).getByText("Booked Beth")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Working" })).getByText("Working Walt")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Done" })).getByText("Done Dana")).toBeInTheDocument();
    expect(screen.queryByText("Cancelled Carl")).not.toBeInTheDocument();
  });

  it("opens the tray when a card is clicked", () => {
    const onSelectAppointment = jest.fn();
    render(
      <JobBoard
        appointments={[job("1", "confirmed", "09:00", "Booked Beth")]}
        currentDate={day}
        onSelectAppointment={onSelectAppointment}
        onStatusChange={() => undefined}
        onCompleteAppointment={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText("Booked Beth"));
    expect(onSelectAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });

  it("moves a booked job to Rolling through the status flow", async () => {
    const onStatusChange = jest.fn();
    render(
      <JobBoard
        appointments={[job("1", "confirmed", "09:00", "Booked Beth")]}
        currentDate={day}
        onSelectAppointment={() => undefined}
        onStatusChange={onStatusChange}
        onCompleteAppointment={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /move booked beth/i }));
    await user.click(await screen.findByRole("menuitem", { name: /move to rolling/i }));
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), "en_route");
  });

  it("sends a Working job to the completion flow, never a raw status write", async () => {
    const onStatusChange = jest.fn();
    const onCompleteAppointment = jest.fn();
    render(
      <JobBoard
        appointments={[job("2", "in_progress", "10:00", "Working Walt")]}
        currentDate={day}
        onSelectAppointment={() => undefined}
        onStatusChange={onStatusChange}
        onCompleteAppointment={onCompleteAppointment}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /move working walt/i }));
    await user.click(await screen.findByRole("menuitem", { name: /complete job/i }));
    expect(onCompleteAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("gives Done cards no move menu — completed is terminal", () => {
    render(
      <JobBoard
        appointments={[job("3", "completed", "08:00", "Done Dana")]}
        currentDate={day}
        onSelectAppointment={() => undefined}
        onStatusChange={() => undefined}
        onCompleteAppointment={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /move done dana/i })).not.toBeInTheDocument();
  });
});
