jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/server/messaging/appointment-events", () => ({
  dispatchAppointmentLifecycle: jest.fn().mockResolvedValue({ status: "queued" }),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { produceCustomerAppointmentReminders } from "@/server/messaging/appointment-reminder-producer";

const NOW = new Date("2026-09-16T16:00:00.000Z");
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const APPOINTMENT_ID = "00000000-0000-4000-8000-000000000002";

function appointmentAt(offsetMinutes: number) {
  return {
    id: APPOINTMENT_ID,
    workspace_id: WORKSPACE_ID,
    customer_id: "00000000-0000-4000-8000-000000000003",
    starts_at: new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString(),
    ends_at: new Date(NOW.getTime() + (offsetMinutes + 60) * 60_000).toISOString(),
    status: "confirmed",
    notes: null,
    metadata: { guest_email: "customer@example.com" },
    updated_at: NOW.toISOString(),
    customers: { id: "00000000-0000-4000-8000-000000000003", first_name: "Jordan", last_name: "Lee", email: "customer@example.com" },
    vehicles: { id: "v1", year: 2021, make: "Cadillac", model: "XT5" },
  };
}

function mockAdmin(appointments: any[]) {
  const appointmentQuery: any = {
    select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), gt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: appointments, error: null }),
  };
  const workspaceQuery: any = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [{ id: WORKSPACE_ID, name: "MOMS Mobile Oil Change", timezone: "America/New_York" }], error: null }),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => table === "appointments" ? appointmentQuery : table === "workspaces" ? workspaceQuery : (() => { throw new Error(table); })()),
  });
}

describe("customer appointment reminder producer", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [7 * 24 * 60, "appointment_reminders.7_days_before", "7d"],
    [72 * 60, "appointment_reminders.72_hours_before", "72h"],
    [24 * 60, "appointment_reminders.24_hours_before", "24h"],
    [60, "appointment_reminders.60_minutes_before", "60m"],
  ])("queues the exact offset reminder at %i minutes", async (minutes, eventKey, stage) => {
    const appointment = appointmentAt(minutes);
    mockAdmin([appointment]);
    await produceCustomerAppointmentReminders(NOW);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledTimes(1);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      eventKey,
      eventId: `${APPOINTMENT_ID}:reminder:${stage}:${appointment.starts_at}`,
    }));
  });

  it("does not queue outside the narrow reminder windows", async () => {
    mockAdmin([appointmentAt(23 * 60)]);
    await produceCustomerAppointmentReminders(NOW);
    expect(dispatchAppointmentLifecycle).not.toHaveBeenCalled();
  });

  it("uses the same deterministic event identity on repeated cron passes", async () => {
    const appointment = appointmentAt(24 * 60);
    mockAdmin([appointment]);
    await produceCustomerAppointmentReminders(NOW);
    mockAdmin([appointment]);
    await produceCustomerAppointmentReminders(new Date(NOW.getTime() + 5 * 60_000));
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledTimes(2);
    const first = (dispatchAppointmentLifecycle as jest.Mock).mock.calls[0][0];
    const second = (dispatchAppointmentLifecycle as jest.Mock).mock.calls[1][0];
    expect(second.eventId).toBe(first.eventId);
    expect(first.eventId).toContain(appointment.starts_at);
  });

  it("changes reminder identity when the appointment is rescheduled", async () => {
    const original = appointmentAt(24 * 60);
    mockAdmin([original]);
    await produceCustomerAppointmentReminders(NOW);
    const rescheduled = { ...original, starts_at: new Date(original.starts_at).getTime() + 60 * 60_000 };
    rescheduled.starts_at = new Date(rescheduled.starts_at).toISOString();
    mockAdmin([rescheduled]);
    await produceCustomerAppointmentReminders(new Date(NOW.getTime() + 60 * 60_000));
    const ids = (dispatchAppointmentLifecycle as jest.Mock).mock.calls.map(call => call[0].eventId);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
