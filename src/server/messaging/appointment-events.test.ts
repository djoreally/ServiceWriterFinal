jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: jest.fn(),
}));
jest.mock("@/server/messaging/appointment-email-snapshot", () => ({
  buildAppointmentEmailSnapshot: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { dispatchLifecycleEvent } from "@/server/messaging/lifecycle-events";
import { buildAppointmentEmailSnapshot } from "@/server/messaging/appointment-email-snapshot";
import {
  appointmentCustomerEmail,
  appointmentLifecycleVariables,
  dispatchAppointmentLifecycle,
  type AppointmentLifecycleRecord,
} from "@/server/messaging/appointment-events";

const mockDispatchLifecycleEvent = dispatchLifecycleEvent as jest.Mock;
const mockBuildSnapshot = buildAppointmentEmailSnapshot as jest.Mock;

function baseAppointment(): AppointmentLifecycleRecord {
  return {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    workspace_id: "ws-1",
    customer_id: "cust-1",
    starts_at: "2026-09-25T14:00:00Z",
    customers: { first_name: "Jordan", last_name: "Smith", email: "jordan@example.com" },
    vehicles: { year: 2019, make: "Honda", model: "Civic" },
    metadata: { estimated_cost: 99.5 },
  };
}

function baseDispatchInput(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: "appointment_booking_sequence.booking_confirmation",
    eventId: "evt-1",
    appointment: baseAppointment(),
    workspaceName: "MOMS Mobile Oil Change",
    workspaceTimezone: "America/New_York",
    actionUrl: "https://servicewriter.xyz/appointments/abcdef12",
    ...overrides,
  };
}

describe("appointmentLifecycleVariables", () => {
  it("populates all variable keys from appointment, workspace, and tech", () => {
    const variables = appointmentLifecycleVariables({
      appointment: baseAppointment(),
      workspaceName: "MOMS Mobile Oil Change",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://servicewriter.xyz/appointments/abcdef12",
      technicianName: "Alex",
      changedFields: ["starts_at", "notes"],
    });
    expect(variables["business.name"]).toBe("MOMS Mobile Oil Change");
    expect(variables["business.timezone"]).toBe("America/New_York");
    expect(variables["customer.first_name"]).toBe("Jordan");
    expect(variables["customer.full_name"]).toBe("Jordan Smith");
    expect(variables["appointment.date"]).toBe("9/25/2026");
    expect(variables["appointment.time"]).toBe("10:00 AM");
    expect(variables["appointment.confirmation_code"]).toBe("ABCDEF12");
    expect(variables["appointment.total"]).toBe("$99.50");
    expect(variables["appointment.changed_fields"]).toBe("starts_at, notes");
    expect(variables["technician.name"]).toBe("Alex");
    expect(variables["vehicle.description"]).toBe("2019 Honda Civic");
    expect(variables["email.primary_action_url"]).toBe(
      "https://servicewriter.xyz/appointments/abcdef12",
    );
  });

  it("falls back when the technician is null or undefined", () => {
    const nullTech = appointmentLifecycleVariables({
      appointment: baseAppointment(),
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
      technicianName: null,
    });
    const missingTech = appointmentLifecycleVariables({
      appointment: baseAppointment(),
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
    });
    expect(nullTech["technician.name"]).toBe("Your assigned technician");
    expect(missingTech["technician.name"]).toBe("Your assigned technician");
  });

  it("uses a generic changed-fields label for an empty array", () => {
    const variables = appointmentLifecycleVariables({
      appointment: baseAppointment(),
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
      changedFields: [],
    });
    expect(variables["appointment.changed_fields"]).toBe("Appointment details");
  });

  it("reads the first customer from an array and falls back to metadata guest name", () => {
    const arrayCustomer = appointmentLifecycleVariables({
      appointment: {
        ...baseAppointment(),
        customers: [
          { first_name: "First", last_name: "Entry", email: "first@example.com" },
          { first_name: "Second", last_name: "Entry", email: "second@example.com" },
        ],
      },
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
    });
    expect(arrayCustomer["customer.full_name"]).toBe("First Entry");

    const guest = appointmentLifecycleVariables({
      appointment: {
        ...baseAppointment(),
        customers: null,
        metadata: { guest_name: "Guest Driver" },
      },
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
    });
    expect(guest["customer.full_name"]).toBe("Guest Driver");
    expect(guest["customer.first_name"]).toBe("Guest");

    const anonymous = appointmentLifecycleVariables({
      appointment: { ...baseAppointment(), customers: null, metadata: {} },
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
    });
    expect(anonymous["customer.full_name"]).toBe("Customer");
  });

  it("falls back through metadata for vehicle, address, service, and payment method", () => {
    const variables = appointmentLifecycleVariables({
      appointment: {
        ...baseAppointment(),
        vehicles: null,
        metadata: {
          vehicle_year: "2021",
          vehicle_make: "Ford",
          service_address: "123 Market St",
          title: "Brake service",
          payment_method: "Credit card",
        },
      },
      workspaceName: "Shop",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://example.com/a",
    });
    expect(variables["vehicle.description"]).toBe("2021 Ford on file");
    expect(variables["appointment.address"]).toBe("123 Market St");
    expect(variables["appointment.service"]).toBe("Brake service");
    expect(variables["appointment.payment_method"]).toBe("Credit card");
    expect(variables["appointment.total"]).toBe("See appointment details");
  });
});

describe("appointmentCustomerEmail", () => {
  it("returns the customer email when present", () => {
    expect(appointmentCustomerEmail(baseAppointment())).toBe("jordan@example.com");
  });

  it("falls back to metadata.guest_email", () => {
    const appointment = baseAppointment();
    appointment.customers = null;
    appointment.metadata = { guest_email: "guest@example.com" };
    expect(appointmentCustomerEmail(appointment)).toBe("guest@example.com");
  });

  it("returns null when neither customer email nor guest email exists", () => {
    const appointment = baseAppointment();
    appointment.customers = null;
    appointment.metadata = {};
    expect(appointmentCustomerEmail(appointment)).toBeNull();
  });

  it("ignores a non-string guest_email", () => {
    const appointment = baseAppointment();
    appointment.customers = null;
    appointment.metadata = { guest_email: 12345 };
    expect(appointmentCustomerEmail(appointment)).toBeNull();
  });
});

describe("dispatchAppointmentLifecycle", () => {
  beforeEach(() => {
    mockBuildSnapshot.mockResolvedValue(null);
    mockDispatchLifecycleEvent.mockResolvedValue({
      templateKey: "appointment_booking_sequence.booking_confirmation",
      eventId: "evt-1",
      recipientRole: "customer",
      status: "queued",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enriches variables with the snapshot and dispatches with the recipient email", async () => {
    mockBuildSnapshot.mockResolvedValue({
      customerEmail: "snapshot@example.com",
      customerId: "snap-cust-1",
      variables: {
        "appointment.date": "9/25/2026 (snapshot)",
        "appointment.vehicle": "2020 Toyota Camry",
        "junk-null": null,
        "junk-empty": "",
      },
      metadata: { snapshotSource: "canonical_appointment_email_snapshot" },
    });

    await dispatchAppointmentLifecycle(baseDispatchInput({ eventKey: "appointment_booking_sequence.booking_confirmation" }));

    expect(mockBuildSnapshot).toHaveBeenCalledTimes(1);
    expect(mockDispatchLifecycleEvent).toHaveBeenCalledTimes(1);
    const event = mockDispatchLifecycleEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.templateKey).toBe("appointment_booking_sequence.booking_confirmation");
    expect(event.eventId).toBe("evt-1");
    expect(event.entityType).toBe("appointment");
    expect(event.recipientEmail).toBe("snapshot@example.com");
    expect(event.customerId).toBe("snap-cust-1");
    const variables = event.variables as Record<string, string>;
    expect(variables["appointment.date"]).toBe("9/25/2026 (snapshot)");
    expect(variables["appointment.vehicle"]).toBe("2020 Toyota Camry");
    expect(variables["customer.first_name"]).toBe("Jordan");
    expect(variables["junk-null"]).toBeUndefined();
    expect(variables["junk-empty"]).toBeUndefined();
    expect(event.metadata).toMatchObject({
      appointmentId: baseAppointment().id,
      snapshotSource: "canonical_appointment_email_snapshot",
    });
  });

  it("prefers an explicit recipientEmail over snapshot and appointment fallbacks", async () => {
    mockBuildSnapshot.mockResolvedValue({
      customerEmail: "snapshot@example.com",
      customerId: "snap-cust-1",
      variables: {},
      metadata: {},
    });

    await dispatchAppointmentLifecycle(baseDispatchInput({ recipientEmail: "explicit@example.com" }));

    const event = mockDispatchLifecycleEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.recipientEmail).toBe("explicit@example.com");
  });

  it("uses the appointment customer email when the snapshot has none", async () => {
    mockBuildSnapshot.mockResolvedValue({ customerEmail: null, customerId: null, variables: {}, metadata: {} });

    await dispatchAppointmentLifecycle(baseDispatchInput());

    const event = mockDispatchLifecycleEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.recipientEmail).toBe("jordan@example.com");
    expect(event.customerId).toBe("cust-1");
  });

  it("returns null without dispatching when no recipient email can be found", async () => {
    mockBuildSnapshot.mockResolvedValue(null);
    const appointment = baseAppointment();
    appointment.customers = null;
    appointment.metadata = {};

    const result = await dispatchAppointmentLifecycle(baseDispatchInput({ appointment }));

    expect(result).toBeNull();
    expect(mockDispatchLifecycleEvent).not.toHaveBeenCalled();
  });

  it("passes null customerId for non-customer recipient roles", async () => {
    await dispatchAppointmentLifecycle(
      baseDispatchInput({ recipientRole: "technician", recipientEmail: "tech@example.com" }),
    );

    const event = mockDispatchLifecycleEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.recipientRole).toBe("technician");
    expect(event.customerId).toBeNull();
  });

  it("falls back to the route payload when snapshot enrichment throws", async () => {
    mockBuildSnapshot.mockRejectedValue(new Error("supabase down"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await dispatchAppointmentLifecycle(baseDispatchInput());

    expect(errorSpy).toHaveBeenCalledWith(
      "[Lifecycle] appointment email snapshot enrichment failed; using route payload",
      expect.any(Error),
    );
    const event = mockDispatchLifecycleEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.recipientEmail).toBe("jordan@example.com");
    expect(event.customerId).toBe("cust-1");
  });
});
