import { describe, it, expect } from "@jest/globals";
import {
  bucketJobChanges,
  composeVehicleDisplay,
  localJobStatus,
  mapComposedAppointmentToLocalJob,
  type ComposedSyncAppointment,
} from "../tech-app-sync.query";

const T0 = Date.parse("2026-11-10T12:00:00.000Z");
const T1 = Date.parse("2026-11-11T12:00:00.000Z");
const T2 = Date.parse("2026-11-11T13:00:00.000Z");

function appt(overrides: Partial<ComposedSyncAppointment> = {}): ComposedSyncAppointment {
  return {
    id: "appt-1",
    serverStatus: "scheduled",
    title: "Full Synthetic Oil Change",
    customerName: "Jane Customer",
    customerPhone: "215-555-0100",
    customerEmail: "jane@example.com",
    vehicleDisplay: "2022 BMW X5 xDrive40i",
    vin: "5UXCR6C09N9K12345",
    mileageIn: 34250,
    address: "428 Railroad Ave, Ambler, PA",
    startsAt: "2026-11-12T13:00:00.000Z",
    endsAt: "2026-11-12T13:45:00.000Z",
    durationMinutes: 45,
    estimatedCost: 133.83,
    notes: null,
    services: [{ name: "Full Synthetic Oil Change", price: 119 }],
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

describe("localJobStatus", () => {
  it("maps the server's working statuses", () => {
    expect(localJobStatus("en_route")).toBe("en_route");
    expect(localJobStatus("in_progress")).toBe("in_progress");
    expect(localJobStatus("completed")).toBe("completed");
  });

  it("reads anything not yet started as assigned", () => {
    expect(localJobStatus("scheduled")).toBe("assigned");
    expect(localJobStatus("confirmed")).toBe("assigned");
    expect(localJobStatus(null)).toBe("assigned");
    expect(localJobStatus(undefined)).toBe("assigned");
    expect(localJobStatus("something_new")).toBe("assigned");
  });
});

describe("composeVehicleDisplay", () => {
  it("joins year/make/model/trim", () => {
    expect(composeVehicleDisplay({ year: 2022, make: "BMW", model: "X5", trim: "xDrive40i" })).toBe(
      "2022 BMW X5 xDrive40i",
    );
  });

  it("skips missing parts and tolerates no vehicle", () => {
    expect(composeVehicleDisplay({ year: 2021, make: "Toyota", model: "Camry", trim: null })).toBe("2021 Toyota Camry");
    expect(composeVehicleDisplay(null)).toBe("");
    expect(composeVehicleDisplay(undefined)).toBe("");
  });
});

describe("mapComposedAppointmentToLocalJob", () => {
  it("carries the appointment id as both the row id and server_id", () => {
    const row = mapComposedAppointmentToLocalJob(appt());
    expect(row.id).toBe("appt-1");
    expect(row.server_id).toBe("appt-1");
    expect(row.services_json).toBe(JSON.stringify([{ name: "Full Synthetic Oil Change", price: 119 }]));
    expect(row.status).toBe("assigned");
  });

  it("synthesizes ends_at from the fallback duration when the server has none", () => {
    const row = mapComposedAppointmentToLocalJob(appt({ endsAt: null, durationMinutes: null }));
    expect(row.duration_minutes).toBe(45);
    expect(row.ends_at).toBe("2026-11-12T13:45:00.000Z");
  });

  it("falls back to a placeholder customer name and the created_at stamp", () => {
    const row = mapComposedAppointmentToLocalJob(appt({ customerName: null, updatedAt: null }));
    expect(row.customer_name).toBe("Customer");
    expect(row.updated_at).toBe(row.created_at);
  });
});

describe("bucketJobChanges", () => {
  it("first pull (last_pulled_at = 0) reports every live row as created", () => {
    const changes = bucketJobChanges([appt(), appt({ id: "appt-2" })], 0);
    expect(changes.created.map((r) => r.id)).toEqual(["appt-1", "appt-2"]);
    expect(changes.updated).toHaveLength(0);
    expect(changes.deleted).toHaveLength(0);
  });

  it("splits created vs updated against last_pulled_at and omits unchanged rows", () => {
    const changes = bucketJobChanges(
      [
        appt({ id: "old-unchanged" }),
        appt({ id: "old-but-edited", updatedAt: new Date(T2).toISOString() }),
        appt({ id: "brand-new", createdAt: new Date(T2).toISOString(), updatedAt: new Date(T2).toISOString() }),
      ],
      T1,
    );
    expect(changes.created.map((r) => r.id)).toEqual(["brand-new"]);
    expect(changes.updated.map((r) => r.id)).toEqual(["old-but-edited"]);
    expect(changes.deleted).toHaveLength(0);
  });

  it("routes cancelled appointments to deleted, on any pull", () => {
    const first = bucketJobChanges([appt({ serverStatus: "cancelled" })], 0);
    expect(first.created).toHaveLength(0);
    expect(first.deleted).toEqual(["appt-1"]);
    const later = bucketJobChanges([appt({ serverStatus: "cancelled", updatedAt: new Date(T2).toISOString() })], T1);
    expect(later.deleted).toEqual(["appt-1"]);
  });

  it("merges extra deleted ids but never deletes an upserted row", () => {
    const changes = bucketJobChanges([appt()], 0, ["gone-1", "appt-1"]);
    expect(changes.deleted).toEqual(["gone-1"]);
    expect(changes.created.map((r) => r.id)).toEqual(["appt-1"]);
  });
});
