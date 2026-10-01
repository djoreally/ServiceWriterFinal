import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAppointmentEmailSnapshot } from "@/server/messaging/appointment-email-snapshot";

type QueryResult = { data: unknown; error: unknown };

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  order(...args: unknown[]): FakeQuery;
  limit(...args: unknown[]): FakeQuery;
  maybeSingle(): Promise<QueryResult>;
  then(resolve: (value: QueryResult) => void): void;
}

function fakeQuery(result: QueryResult): FakeQuery {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => void) => {
      resolve(result);
    },
  } as FakeQuery;
  return query;
}

function fakeSupabase(tables: Record<string, QueryResult>): SupabaseClient {
  return {
    from: jest.fn((table: string) => fakeQuery(tables[table] ?? { data: null, error: null })),
  } as unknown as SupabaseClient;
}

function baseAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    workspace_id: "ws-1",
    customer_id: "cust-1",
    starts_at: "2026-09-25T14:00:00Z",
    customers: {
      id: "cust-1",
      first_name: "Jordan",
      last_name: "Smith",
      email: "jordan@example.com",
    },
    vehicles: { year: 2019, make: "Honda", model: "Civic" },
    metadata: { estimated_cost: 150 },
    ...overrides,
  };
}

const ITEMS = [
  {
    description: "Oil change",
    quantity: 1,
    unit_price: 99.99,
    service_catalog: [{ name: "Synthetic oil change" }],
  },
  {
    description: "Filter",
    quantity: 2,
    unit_price: 12.5,
    service_catalog: null,
  },
];

describe("buildAppointmentEmailSnapshot", () => {
  it("builds a full snapshot with customer, services, and invoice", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: ITEMS, error: null },
      work_orders: { data: { id: "wo-1" }, error: null },
      invoices: {
        data: { invoice_number: "INV-7", total: 149.98, status: "paid" },
        error: null,
      },
    });

    const appointment = baseAppointment();
    const snapshot = await buildAppointmentEmailSnapshot(supabase, appointment);

    expect(snapshot.customerEmail).toBe("jordan@example.com");
    expect(snapshot.customerId).toBe("cust-1");
    expect(snapshot.appointment).toBe(appointment);
    expect(snapshot.variables["customer.first_name"]).toBe("Jordan");
    expect(snapshot.variables["customer.full_name"]).toBe("Jordan Smith");
    expect(snapshot.variables["appointment.vehicle"]).toBe("2019 Honda Civic");
    expect(snapshot.variables["appointment.service"]).toBe("Synthetic oil change × 1, Filter × 2");
    expect(snapshot.variables["appointment.services"]).toBe(
      "Synthetic oil change × 1 — $99.99\nFilter × 2 — $25.00",
    );
    expect(snapshot.variables["appointment.date"]).toBe("9/25/2026");
    expect(snapshot.variables["appointment.time"]).toBe("10:00 AM");
    expect(snapshot.variables["appointment.total"]).toBe("$149.98");
    expect(snapshot.variables["invoice.number"]).toBe("INV-7");
    expect(snapshot.variables["invoice.total"]).toBe("$149.98");
    expect(snapshot.variables["invoice.status"]).toBe("paid");
    expect(snapshot.metadata).toMatchObject({
      appointmentId: "appt-1",
      vehicleCount: "1",
      serviceLineCount: "2",
      snapshotSource: "canonical_appointment_email_snapshot",
    });
    expect((supabase.from as jest.Mock).mock.calls.map((call) => call[0])).toContain("invoices");
  });

  it("handles a guest booking with no linked customer and no work order", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: [], error: null },
      work_orders: { data: null, error: null },
    });
    const appointment = baseAppointment({
      customer_id: null,
      customers: null,
      vehicles: null,
      metadata: {
        guest_email: "guest@example.com",
        guest_name: "Guest Driver",
        estimated_cost: 79.99,
        arrival_window: "2–4 PM",
      },
    });

    const snapshot = await buildAppointmentEmailSnapshot(supabase, appointment);

    expect(snapshot.customerEmail).toBe("guest@example.com");
    expect(snapshot.customerId).toBeNull();
    expect(snapshot.variables["customer.first_name"]).toBe("Guest");
    expect(snapshot.variables["customer.full_name"]).toBe("Guest Driver");
    expect(snapshot.variables["appointment.vehicle"]).toBe("");
    expect(snapshot.variables["appointment.service"]).toBe("Service");
    expect(snapshot.variables["appointment.total"]).toBe("$79.99");
    expect(snapshot.variables["appointment.arrival_window"]).toBe("2–4 PM");
    expect(snapshot.variables["invoice.number"]).toBeUndefined();
    expect(snapshot.metadata.vehicleCount).toBe("0");
    const fromCalls = (supabase.from as jest.Mock).mock.calls.map((call) => call[0]);
    expect(fromCalls).toContain("appointment_items");
    expect(fromCalls).toContain("invoices");
    expect(fromCalls).not.toContain("work_orders");
  });

  it("reads the first customer when customers is an array", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: [], error: null },
      work_orders: { data: null, error: null },
    });
    const appointment = baseAppointment({
      customers: [
        { first_name: "First", last_name: "Entry", email: "first@example.com" },
        { first_name: "Second", last_name: "Entry", email: "second@example.com" },
      ],
    });

    const snapshot = await buildAppointmentEmailSnapshot(supabase, appointment);
    expect(snapshot.customerEmail).toBe("first@example.com");
    expect(snapshot.variables["customer.first_name"]).toBe("First");
  });

  it("returns null customerEmail when there is no linked customer and no guest email", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: [], error: null },
      work_orders: { data: null, error: null },
    });
    const snapshot = await buildAppointmentEmailSnapshot(
      supabase,
      baseAppointment({ customer_id: null, customers: null, metadata: {} }),
    );
    expect(snapshot.customerEmail).toBeNull();
    expect(snapshot.variables["customer.first_name"]).toBe("there");
    expect(snapshot.variables["customer.full_name"]).toBe("Customer");
  });

  it("labels vehicles from booking_configuration and counts them", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: [], error: null },
      work_orders: { data: null, error: null },
    });
    const snapshot = await buildAppointmentEmailSnapshot(
      supabase,
      baseAppointment({
        vehicles: null,
        metadata: {
          booking_configuration: {
            vehicles: [
              { year: "2021", make: "Ford", model: "F-150" },
              { make: "Toyota" },
            ],
          },
        },
      }),
    );
    expect(snapshot.variables["appointment.vehicle"]).toBe("2021 Ford F-150, Toyota");
    expect(snapshot.variables["appointment.vehicles"]).toBe("2021 Ford F-150, Toyota");
    expect(snapshot.metadata.vehicleCount).toBe("2");
  });

  it("prefers metadata timezones and leaves date/time undefined for invalid timestamps", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: [], error: null },
      work_orders: { data: null, error: null },
    });
    const invalid = await buildAppointmentEmailSnapshot(
      supabase,
      baseAppointment({ starts_at: "not-a-date" }),
      "America/Chicago",
    );
    expect(invalid.variables["appointment.date"]).toBeUndefined();
    expect(invalid.variables["appointment.time"]).toBeUndefined();
    expect(invalid.variables["business.timezone"]).toBe("America/Chicago");

    const withMetadataTz = await buildAppointmentEmailSnapshot(
      supabase,
      baseAppointment({ metadata: { business_timezone: "America/Los_Angeles" } }),
    );
    expect(withMetadataTz.variables["business.timezone"]).toBe("America/Los_Angeles");
    expect(withMetadataTz.variables["appointment.time"]).toBe("7:00 AM");
  });

  it("throws when the items query fails", async () => {
    const supabase = fakeSupabase({
      appointment_items: { data: null, error: new Error("items failed") },
      work_orders: { data: null, error: null },
    });
    await expect(buildAppointmentEmailSnapshot(supabase, baseAppointment())).rejects.toThrow(
      "items failed",
    );
  });
});
