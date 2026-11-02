/**
 * Grey-box tests for the appointments Hono router.
 * Drives the router over HTTP with Supabase + messaging pipelines mocked.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  appointmentEventsFactory as mockAppointmentEventsFactory,
  lifecycleActionUrlsFactory as mockLifecycleActionUrlsFactory,
  lifecycleEventsFactory as mockLifecycleEventsFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  stripeInvoiceSyncFactory as mockStripeInvoiceSyncFactory,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);
jest.mock("@/server/messaging/appointment-events", () =>
  mockAppointmentEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/messaging/lifecycle-action-urls", () =>
  mockLifecycleActionUrlsFactory(),
);

import { appointmentsRouter as appointmentsRouterRaw } from "@/server/hono/routes/appointments";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const appointmentsRouter = testRouter(appointmentsRouterRaw);

const APPT_ID = "990e8400-e29b-41d4-a716-446655440001";

const validCreateBody = {
  workspace_id: WS_ID,
  customer_id: CUSTOMER_ID,
  starts_at: "2026-10-01T14:00:00Z",
  ends_at: "2026-10-01T15:00:00Z",
  override_availability: true,
};

beforeEach(() => {
  resetHarness();
});

describe("appointments router", () => {
  describe("GET /v1/appointments", () => {
    it("lists appointments with pagination for a member", async () => {
      db.appointments = {
        data: [{ id: APPT_ID, status: "confirmed" }],
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}&limit=10&offset=0`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toEqual({ limit: 10, offset: 0 });
    });

    it("requires workspace_id", async () => {
      const res = await appointmentsRouter.request("/v1/appointments");
      // Grey-box: the handler throws a plain Error; the contract maps it to 500.
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("internal_error");
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthenticated");
    });

    it("returns 403 for non-members", async () => {
      authState.mode = "forbidden";
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/appointments", () => {
    function seedHappyPath() {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, status: "active" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      db["workspace_settings:single"] = { data: {}, error: null };
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
    }

    it("creates an appointment and returns 201", async () => {
      seedHappyPath();
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(APPT_ID);
      // A create writes two rows: the appointment itself, plus the
      // audit_events record from the route's logMutation call
      // (action "appointment.created"). The audit write is part of the
      // current contract, so the insert count is 2, not 1.
      expect(calls.inserts).toHaveLength(2);
      expect(calls.inserts[0].table).toBe("appointments");
      expect(calls.inserts[1].table).toBe("audit_events");
      expect(
        (calls.inserts[1].rows as Record<string, unknown>).action,
      ).toBe("appointment.created");
    });

    it("rejects an unknown customer with 400", async () => {
      db["customers:single"] = { data: null, error: null };
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_customer");
      expect(calls.inserts).toHaveLength(0);
    });

    it("rejects ends_at before starts_at", async () => {
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validCreateBody,
          ends_at: "2026-10-01T13:00:00Z",
        }),
      });
      // zod superRefine violation -> ZodError -> 400 invalid_input via
      // errorResponse: client validation failures are a 400, never a 500.
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
    });

    it("enforces staff roles on create", async () => {
      authState.role = "technician";
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/appointments/:id", () => {
    it("returns the appointment with explicit workspace_id", async () => {
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(APPT_ID);
    });

    it("rejects a malformed id with 404 (route pattern only matches uuid-shaped ids)", async () => {
      const res = await appointmentsRouter.request(
        `/v1/appointments/not-a-uuid?workspace_id=${WS_ID}`,
      );
      // The GET route is registered with an id pattern of
      // {[0-9a-fA-F-]{36}}, so a malformed id matches no route and the
      // router answers 404 rather than reaching the handler at all.
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /v1/appointments/:id", () => {
    const current = {
      id: APPT_ID,
      workspace_id: WS_ID,
      customer_id: null,
      vehicle_id: null,
      location_id: null,
      starts_at: "2026-10-01T14:00:00Z",
      ends_at: "2026-10-01T15:00:00Z",
      status: "scheduled",
      assigned_user_id: null,
      metadata: {},
    };

    it("applies a status/notes patch and returns 200", async () => {
      db["appointments:single"] = {
        data: { ...current, status: "confirmed", notes: "updated" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_id: WS_ID,
            status: "confirmed",
            notes: "updated",
          }),
        },
      );
      expect(res.status).toBe(200);
      expect(calls.updates).toHaveLength(1);
      expect(calls.updates[0].table).toBe("appointments");
    });

    it("enforces staff roles on update", async () => {
      authState.role = "technician";
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, notes: "x" }),
        },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /v1/appointments/:id", () => {
    it("soft-cancels the appointment and returns 200", async () => {
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "cancelled" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      expect(calls.updates).toHaveLength(1);
      expect(
        (calls.updates[0].patch as Record<string, unknown>).status,
      ).toBe("cancelled");
      expect((await res.json()).data.status).toBe("cancelled");
    });
  });

  describe("B1 canonical status vocabulary", () => {
    it("GET list composes canonical status + label + tone and collapses synonyms", async () => {
      db.appointments = {
        data: [
          { id: APPT_ID, status: "on_the_way", metadata: { dispatch_status: "on_the_way" } },
          { id: APPT_ID, status: "weather_hold" },
          { id: APPT_ID, status: "confirmed", dispatch_status: "arrived", metadata: { dispatch_status: "en_route" } },
        ],
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}&limit=10&offset=0`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // T-12: on_the_way collapses to en_route on both axes.
      expect(body.data[0].status).toBe("en_route");
      expect(body.data[0].status_label).toBe("En route");
      expect(body.data[0].status_tone).toBe("info");
      expect(body.data[0].dispatch_status).toBe("en_route");
      // T-9: an unrecognized status renders as itself, never as Confirmed.
      expect(body.data[1].status).toBe("weather_hold");
      expect(body.data[1].status_label).toBe("Weather hold");
      expect(body.data[1].status_tone).toBe("neutral");
      // T-11: the dispatch column outranks the metadata copy.
      expect(body.data[2].dispatch_status).toBe("arrived");
      expect(body.data[2].dispatch_status_label).toBe("Arrived");
    });

    it("PATCH stores the canonical status when a synonym is written", async () => {
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          workspace_id: WS_ID,
          customer_id: null,
          vehicle_id: null,
          location_id: null,
          starts_at: "2026-10-01T14:00:00Z",
          ends_at: "2026-10-01T15:00:00Z",
          status: "en_route",
          assigned_user_id: null,
          metadata: {},
        },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, status: "on_the_way" }),
        },
      );
      expect(res.status).toBe(200);
      const patch = calls.updates.find((u) => u.table === "appointments")?.patch as Record<string, unknown>;
      expect(patch.status).toBe("en_route");
      const body = await res.json();
      expect(body.data.status).toBe("en_route");
      expect(body.data.status_label).toBe("En route");
    });

    it("technician-status writes dispatch to the column, not metadata (T-11)", async () => {
      db["workspace_members"] = { data: [{ workspace_id: WS_ID }], error: null };
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          status: "confirmed",
          assigned_user_id: "660e8400-e29b-41d4-a716-446655440001",
          dispatch_status: null,
          metadata: {
            dispatch_status: "acknowledged",
            dispatch_status_updated_at: "2026-10-01T00:00:00Z",
            keep_me: true,
          },
        },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/technician-status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, status: "en_route" }),
        },
      );
      expect(res.status).toBe(200);
      const patch = calls.updates.find((u) => u.table === "appointments")?.patch as Record<string, unknown>;
      expect(patch.dispatch_status).toBe("en_route");
      const nextMetadata = patch.metadata as Record<string, unknown>;
      expect(nextMetadata).not.toHaveProperty("dispatch_status");
      expect(nextMetadata).not.toHaveProperty("dispatch_status_updated_at");
      expect(nextMetadata.keep_me).toBe(true);
      const body = await res.json();
      expect(body.data.status_label).toBe("Confirmed");
      expect(body.data.status_tone).toBe("info");
    });
  });

  describe("B2 server-composed display_title (T-1)", () => {
    const APPT_ID_2 = "990e8400-e29b-41d4-a716-446655440002";

    it("GET list composes display_title + primary_service_name + confirmation_code per row", async () => {
      db["workspaces:single"] = { data: { timezone: "America/New_York" }, error: null };
      db.appointments = {
        data: [
          {
            id: APPT_ID,
            status: "confirmed",
            starts_at: "2026-10-30T14:00:00.000Z",
            confirmation_code: "78361AF6",
            customers: { first_name: "Laurie", last_name: "Buckman" },
            vehicles: { year: 2020, make: "Jaguar", model: "F-PACE" },
            metadata: {},
          },
          {
            id: APPT_ID_2,
            status: "confirmed",
            starts_at: "2026-10-31T15:00:00.000Z",
            customers: null,
            vehicles: { year: 2015, make: "Cadillac", model: "SRX" },
            metadata: { guest_name: "Micheal Holmes", service_name: "Full Synthetic Oil Change" },
          },
        ],
        error: null,
      };
      // The primary service is the FIRST service line per appointment.
      db.appointment_items = {
        data: [
          { appointment_id: APPT_ID, description: "Full Synthetic Oil Change", sort_order: 0 },
          { appointment_id: APPT_ID, description: "Wiper Blade Replacement", sort_order: 1 },
        ],
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}&limit=10&offset=0`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // The truth table's canonical composition, in the workspace timezone.
      expect(body.data[0].display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
      expect(body.data[0].primary_service_name).toBe("Full Synthetic Oil Change");
      expect(body.data[0].confirmation_code).toBe("78361AF6");
      // Guest job: guest name wins over the vehicle; service from metadata
      // when the job has no service lines.
      expect(body.data[1].display_title).toBe("Micheal Holmes — Sat, Oct 31 · 11:00 AM");
      expect(body.data[1].primary_service_name).toBe("Full Synthetic Oil Change");
      expect(body.data[1].confirmation_code).toBeNull();
    });

    it("GET detail composes the title fields and never a UUID headline", async () => {
      db["workspaces:single"] = { data: { timezone: "America/New_York" }, error: null };
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          status: "completed",
          starts_at: "2026-10-30T14:00:00.000Z",
          confirmation_code: "78361AF6",
          customers: { first_name: "Laurie", last_name: "Buckman" },
          vehicles: { year: 2025, make: "Subaru", model: "Crosstrek" },
          metadata: { title: "STORED TITLE THAT MUST NOT WIN" },
        },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
      expect(body.data.confirmation_code).toBe("78361AF6");
      expect(body.data.display_title).not.toContain("STORED TITLE");
      expect(body.data.display_title).not.toContain("990E8400");
    });
  });

  describe("B4 spec merge + multi-vehicle union (T-2/T-3/T-4)", () => {
    const JAG_ID = "aa0e8400-e29b-41d4-a716-446655440001";
    const CROSS_ID = "aa0e8400-e29b-41d4-a716-446655440002";
    const SRX_ID = "aa0e8400-e29b-41d4-a716-446655440003";
    const INV_ID = "aa0e8400-e29b-41d4-a716-446655440010";

    const jaguarRow = {
      id: JAG_ID, year: 2020, make: "Jaguar", model: "F-PACE",
      vin: "SADCJ2FXXLA648278", license_plate: null, mileage: 60020,
    };
    const crosstrekRow = {
      id: CROSS_ID, year: 2025, make: "Subaru", model: "Crosstrek",
      vin: "4S4GUHM61S3747426", license_plate: null, mileage: 6755,
    };

    function seedMembershipAndAppointment(appointment: Record<string, unknown>) {
      db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
      db["appointments:single"] = { data: appointment, error: null };
    }

    it("returns EVERY vehicle on the job with merged specs (Laurie's shape)", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: JAG_ID, metadata: {},
        updated_at: "2026-10-30T18:00:00.000Z", created_at: "2026-10-30T14:00:00.000Z",
        starts_at: "2026-10-30T14:00:00.000Z",
      });
      db.vehicles = { data: [jaguarRow, crosstrekRow], error: null };
      db.appointment_items = {
        data: [
          { id: "i1", description: "Full Synthetic Oil Change", quantity: 1, unit_price: 133, sort_order: 0, metadata: { vehicle_id: JAG_ID } },
          { id: "i2", description: "Waste Oil Disposal Fee", quantity: 1, unit_price: 4, sort_order: 1, metadata: { vehicle_id: JAG_ID } },
          { id: "i3", description: "Full Synthetic Oil Change", quantity: 1, unit_price: 133, sort_order: 0, metadata: { vehicle_id: CROSS_ID } },
          { id: "i4", description: "Waste Oil Disposal Fee", quantity: 1, unit_price: 4, sort_order: 1, metadata: { vehicle_id: CROSS_ID } },
        ],
        error: null,
      };
      // The push-created learned rows: the Jaguar's oil fields are NULL;
      // the Crosstrek's were later settled by the shop.
      db.vehicle_service_specs = {
        data: [
          { vehicle_id: JAG_ID, engine: "2.0L I4", oil_type: null, oil_capacity: null, oil_filter: null, updated_at: "2026-10-30T14:00:00.000Z" },
          { vehicle_id: CROSS_ID, engine: "2.5L", oil_type: "0W-20", oil_capacity: "4.7 qt", oil_filter: "NAPA Gold 7055", updated_at: "2026-10-30T15:00:00.000Z" },
        ],
        error: null,
      };
      db.vehicle_specifications = {
        data: [
          { year: 2020, make: "Jaguar", model: "F-PACE", engine: "2.0L Turbo", oil_type: "0W-20", oil_capacity: "7.4 qt", oil_filter: "OEM Cartridge" },
          { year: 2025, make: "Subaru", model: "Crosstrek", engine: "2.5L", oil_type: "0W-16", oil_capacity: "4.4 qt", oil_filter: "15208AA15A" },
        ],
        error: null,
      };
      db.invoices = { data: [], error: null };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const vehicles = body.configuration.vehicles;
      // The Crosstrek block the detail page used to lose.
      expect(vehicles).toHaveLength(2);
      expect(vehicles[0].clientVehicleId).toBe(JAG_ID);
      expect(vehicles[1].clientVehicleId).toBe(CROSS_ID);

      // Jaguar: learned NULLs fall to the catalog; status says so.
      expect(vehicles[0].oil).toEqual({
        engine: "2.0L I4",
        oilType: "0W-20",
        oilCapacity: "7.4 qt",
        oilFilter: "OEM Cartridge",
        capacitySource: "db",
      });
      expect(vehicles[0].specStatus).toBe("from_catalog");
      expect(vehicles[0].specSources).toEqual({
        engine: "learned",
        oilType: "catalog",
        oilCapacity: "catalog",
        oilFilter: "catalog",
      });
      expect(vehicles[0].services).toHaveLength(2);
      expect(vehicles[0].services[0]).toEqual({
        id: "i1", name: "Full Synthetic Oil Change", price: 133, quantity: 1,
      });

      // Crosstrek: the shop's settled record wins over the catalog.
      expect(vehicles[1].oil.oilType).toBe("0W-20");
      expect(vehicles[1].oil.oilFilter).toBe("NAPA Gold 7055");
      expect(vehicles[1].specStatus).toBe("verified");
      expect(vehicles[1].services).toHaveLength(2);
    });

    it("finds a second vehicle that exists only on invoice lines", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: JAG_ID, metadata: {},
        updated_at: "2026-10-30T18:00:00.000Z", created_at: "2026-10-30T14:00:00.000Z",
        starts_at: "2026-10-30T14:00:00.000Z",
      });
      db.vehicles = { data: [jaguarRow, crosstrekRow], error: null };
      // Pre-normalization shape: one unpinned item for the whole job.
      db.appointment_items = {
        data: [
          { id: "i1", description: "Full Synthetic Oil Change", quantity: 1, unit_price: 267.66, sort_order: 0, metadata: {} },
        ],
        error: null,
      };
      db.invoices = {
        data: [{ id: INV_ID, metadata: { appointment_id: APPT_ID } }],
        error: null,
      };
      db.invoice_lines = {
        data: [{ vehicle_id: JAG_ID }, { vehicle_id: CROSS_ID }],
        error: null,
      };
      db.vehicle_service_specs = {
        data: [
          { vehicle_id: CROSS_ID, engine: "2.5L", oil_type: "0W-20", oil_capacity: "4.7 qt", oil_filter: "NAPA Gold 7055", updated_at: "2026-10-30T15:00:00.000Z" },
        ],
        error: null,
      };
      db.vehicle_specifications = { data: [], error: null };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const vehicles = body.configuration.vehicles;
      expect(vehicles).toHaveLength(2);
      expect(vehicles[1].clientVehicleId).toBe(CROSS_ID);
      expect(vehicles[1].specStatus).toBe("verified");
      // Unpinned lines are never assigned to a vehicle by guesswork.
      expect(vehicles[0].services).toBeUndefined();
      expect(vehicles[1].services).toBeUndefined();
    });

    it("merges over a stored snapshot without mutating its extras", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: SRX_ID,
        metadata: {
          booking_configuration: {
            schemaVersion: 2,
            capturedAt: "2026-10-31T15:00:00.000Z",
            vehicles: [
              {
                clientVehicleId: SRX_ID,
                vehicle: { year: "2015", make: "Cadillac", model: "SRX", vin: "3GYFNJE36FS123456" },
                oil: { engine: "3.6L V6" },
                tire: {
                  frontSize: "235/65R18", source: "oe", frontQuantity: 4, rearQuantity: 4,
                  options: { mountAndBalance: true, tpms: false, disposal: true },
                },
              },
            ],
          },
        },
        updated_at: "2026-10-31T15:00:00.000Z", created_at: "2026-10-31T14:00:00.000Z",
        starts_at: "2026-10-31T15:00:00.000Z",
      });
      db.vehicles = {
        data: [{ id: SRX_ID, year: 2015, make: "Cadillac", model: "SRX", vin: "3GYFNJE36FS123456", license_plate: "PA-1", mileage: 88123 }],
        error: null,
      };
      db.appointment_items = { data: [], error: null };
      db.invoices = { data: [], error: null };
      db.vehicle_service_specs = {
        data: [
          { vehicle_id: SRX_ID, engine: "3.6L V6", oil_type: "5W-30", oil_capacity: "6.0 qt", oil_filter: null, updated_at: "2026-10-31T15:30:00.000Z" },
        ],
        error: null,
      };
      db.vehicle_specifications = {
        data: [
          { year: 2015, make: "Cadillac", model: "SRX", engine: "3.6L V6", oil_type: "5W-30 dexos", oil_capacity: "6.0 qt", oil_filter: "PF63E" },
        ],
        error: null,
      };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.configuration.capturedAt).toBe("2026-10-31T15:00:00.000Z");
      const vehicle = body.configuration.vehicles[0];
      // Booked extras ride along intact; the live mileage fills in.
      expect(vehicle.tire.frontSize).toBe("235/65R18");
      expect(vehicle.vehicle.mileage).toBe(88123);
      // Learned beats catalog on grade; the catalog supplies the filter
      // the learned record never settled.
      expect(vehicle.oil.oilType).toBe("5W-30");
      expect(vehicle.oil.oilFilter).toBe("PF63E");
      expect(vehicle.specSources.oilFilter).toBe("catalog");
      expect(vehicle.specStatus).toBe("from_catalog");
    });

    it("keeps single-vehicle jobs whole: unpinned lines group to the one vehicle", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: SRX_ID, metadata: {},
        updated_at: "2026-10-31T15:00:00.000Z", created_at: "2026-10-31T14:00:00.000Z",
        starts_at: "2026-10-31T15:00:00.000Z",
      });
      db.vehicles = {
        data: [{ id: SRX_ID, year: 2015, make: "Cadillac", model: "SRX", vin: "3GYFNJE36FS123456", license_plate: null, mileage: 88123 }],
        error: null,
      };
      db.appointment_items = {
        data: [
          { id: "i1", description: "Full Synthetic Oil Change", quantity: 1, unit_price: 119, sort_order: 0, metadata: {} },
          { id: "i2", description: "Waste Oil Disposal Fee", quantity: 1, unit_price: 4, sort_order: 1, metadata: {} },
        ],
        error: null,
      };
      db.invoices = { data: [], error: null };
      db.vehicle_service_specs = {
        data: [
          { vehicle_id: SRX_ID, engine: "3.6L V6", oil_type: "5W-30", oil_capacity: "6.0 qt", oil_filter: "PF63E", updated_at: "2026-10-31T15:30:00.000Z" },
        ],
        error: null,
      };
      db.vehicle_specifications = { data: [], error: null };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.configuration.schemaVersion).toBe(2);
      expect(body.configuration.vehicles).toHaveLength(1);
      const vehicle = body.configuration.vehicles[0];
      expect(vehicle.clientVehicleId).toBe(SRX_ID);
      expect(vehicle.vehicle.year).toBe("2015");
      expect(vehicle.specStatus).toBe("verified");
      expect(vehicle.services).toHaveLength(2);
      expect(vehicle.services[1].name).toBe("Waste Oil Disposal Fee");
    });

    it("states needs_verification honestly when no source knows the vehicle", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: SRX_ID, metadata: {},
        updated_at: "2026-10-31T15:00:00.000Z", created_at: "2026-10-31T14:00:00.000Z",
        starts_at: "2026-10-31T15:00:00.000Z",
      });
      db.vehicles = {
        data: [{ id: SRX_ID, year: 1999, make: "Mystery", model: "Van", vin: null, license_plate: null, mileage: null }],
        error: null,
      };
      db.appointment_items = { data: [], error: null };
      db.invoices = { data: [], error: null };
      db.vehicle_service_specs = { data: [], error: null };
      db.vehicle_specifications = { data: [], error: null };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const vehicle = body.configuration.vehicles[0];
      expect(vehicle.oil).toBeUndefined();
      expect(vehicle.specStatus).toBe("needs_verification");
      expect(vehicle.specSources).toEqual({});
    });

    it("returns a null configuration when the job has no vehicle anywhere", async () => {
      seedMembershipAndAppointment({
        id: APPT_ID, workspace_id: WS_ID, vehicle_id: null, metadata: {},
        updated_at: "2026-10-31T15:00:00.000Z", created_at: "2026-10-31T14:00:00.000Z",
        starts_at: "2026-10-31T15:00:00.000Z",
      });
      db.appointment_items = { data: [], error: null };
      db.invoices = { data: [], error: null };

      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/booking-configuration`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.configuration).toBeNull();
    });
  });

  describe("Google Calendar auto-sync", () => {
    function seedConnectedUser(action = "created") {
      db["google_calendar_sync_tokens"] = {
        data: { sync_enabled: true },
        error: null,
      };
      db["fn:google-calendar-sync"] = {
        data: { synced: true, action, google_event_id: "evt-1" },
        error: null,
      };
    }

    function seedCreateHappyPath() {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, status: "active" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      db["workspace_settings:single"] = { data: {}, error: null };
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
    }

    /** calendar_sync records written by the auto-sync hook (not the route's own update). */
    function calendarSyncRecords() {
      return calls.updates
        .map((u) => (u.patch as Record<string, unknown>).metadata)
        .filter(
          (metadata): metadata is Record<string, unknown> =>
            Boolean(metadata) && typeof metadata === "object" && "calendar_sync" in metadata,
        )
        .map((metadata) => metadata.calendar_sync as Record<string, unknown>);
    }

    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("syncs on create and records a synced status in metadata", async () => {
      seedCreateHappyPath();
      seedConnectedUser("created");
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("created");
      expect(records[0].google_event_id).toBe("evt-1");
    });

    it("syncs on update (reschedule) and records the updated action", async () => {
      seedConnectedUser("updated");
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          workspace_id: WS_ID,
          starts_at: "2026-10-01T16:00:00Z",
          ends_at: "2026-10-01T17:00:00Z",
          status: "confirmed",
          metadata: {},
        },
        error: null,
      };
      db["workspaces:single"] = { data: { name: "Test Shop", timezone: "UTC" }, error: null };
      const res = await appointmentsRouter.request(`/v1/appointments/${APPT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: WS_ID,
          starts_at: "2026-10-01T16:00:00Z",
        }),
      });
      expect(res.status).toBe(200);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("updated");
    });

    it("syncs on cancel so the edge function removes the calendar event", async () => {
      seedConnectedUser("deleted");
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "cancelled", metadata: {} },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("deleted");
    });

    it("still returns 201 when the edge function fails, recording a failed sync status", async () => {
      seedCreateHappyPath();
      db["google_calendar_sync_tokens"] = {
        data: { sync_enabled: true },
        error: null,
      };
      db["fn:google-calendar-sync"] = {
        data: null,
        error: new Error("edge function unavailable"),
      };
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("failed");
      expect(records[0].error).toContain("edge function unavailable");
    });

    it("does not touch calendar state when the user never connected Google", async () => {
      seedCreateHappyPath();
      // No google_calendar_sync_tokens row and no edge-function stub.
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);
      expect(calendarSyncRecords()).toHaveLength(0);
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("POST /v1/appointments/:id/complete", () => {
    it("runs closeout and returns completion summary", async () => {
      db["workspace_members"] = {
        data: [{ workspace_id: WS_ID }],
        error: null,
      };
      db["rpc:complete_appointment_closeout_v1"] = {
        data: { service_record_id: "sr-1", invoice_id: "", payment_id: "" },
        error: null,
      };
      db["workspace_billing:single"] = { data: null, error: null };
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          status: "completed",
          customer_id: CUSTOMER_ID,
          metadata: {},
        },
        error: null,
      };
      db["workspaces:single"] = {
        data: { name: "Test Shop", timezone: "UTC" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.service_record_id).toBe("sr-1");
      expect(body.data.completion_email.status).toBe("queued");
      expect(
        calls.rpc.some((r) => r.fn === "complete_appointment_closeout_v1"),
      ).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID }),
        },
      );
      expect(res.status).toBe(401);
    });
  });

  describe("route registration", () => {
    it("exposes the dispatch event endpoints", async () => {
      db["dispatch_events"] = { data: [], error: null };
      const res = await appointmentsRouter.request(
        `/v1/dispatch-events?workspace_id=${WS_ID}`,
      );
      expect([200, 400, 401, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await appointmentsRouter.request("/v1/appointments-zzz");
      expect(res.status).toBe(404);
    });
  });

  describe("inspections: performer-data + items workspace access", () => {
    const LINKED_TEMPLATE_ID = "aa0e8400-e29b-41d4-a716-446655440020";
    const OTHER_USER_ID = "880e8400-e29b-41d4-a716-446655440001";

    it("performer-data returns the workspace's catalog-linked template (deduped)", async () => {
      // The gate's required template is linked from the workspace catalog;
      // the handler merges the caller's own templates with the linked ones.
      // (Grey-box harness: table-level canned results, so this asserts the
      // endpoint contract — the linked template surfaces exactly once.)
      db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
      db.service_catalog = {
        data: [{ inspection_template_id: LINKED_TEMPLATE_ID }],
        error: null,
      };
      db.inspection_templates = {
        data: [
          {
            id: LINKED_TEMPLATE_ID,
            name: "MOMS Basic 8-Point Inspection",
            description: null,
            category: null,
          },
        ],
        error: null,
      };
      db.service_inspections = { data: [], error: null };
      const res = await appointmentsRouter.request("/v1/inspections/performer-data");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.templates).toHaveLength(1);
      expect(body.data.templates[0].id).toBe(LINKED_TEMPLATE_ID);
      expect(body.data.templates[0].name).toBe("MOMS Basic 8-Point Inspection");
      expect(body.data.pastInspections).toEqual([]);
    });

    it("items are readable for a catalog-linked template owned by another user", async () => {
      db["inspection_templates:single"] = {
        data: { id: LINKED_TEMPLATE_ID, user_id: OTHER_USER_ID },
        error: null,
      };
      db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
      db.service_catalog = {
        data: [{ inspection_template_id: LINKED_TEMPLATE_ID }],
        error: null,
      };
      db.inspection_items = {
        data: [
          { id: "item-1", template_id: LINKED_TEMPLATE_ID, name: "Oil level", sort_order: 0 },
        ],
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/inspections/items?template_id=${LINKED_TEMPLATE_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Oil level");
    });

    it("items still 404 for another user's template with no catalog link", async () => {
      db["inspection_templates:single"] = {
        data: { id: LINKED_TEMPLATE_ID, user_id: OTHER_USER_ID },
        error: null,
      };
      db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
      db.service_catalog = { data: [], error: null };
      const res = await appointmentsRouter.request(
        `/v1/inspections/items?template_id=${LINKED_TEMPLATE_ID}`,
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("not_found");
    });

    it("items stay readable for the template owner without any catalog link", async () => {
      db["inspection_templates:single"] = {
        data: { id: LINKED_TEMPLATE_ID, user_id: USER_ID },
        error: null,
      };
      db.service_catalog = { data: [], error: null };
      db.inspection_items = { data: [], error: null };
      const res = await appointmentsRouter.request(
        `/v1/inspections/items?template_id=${LINKED_TEMPLATE_ID}`,
      );
      expect(res.status).toBe(200);
    });
  });
});
