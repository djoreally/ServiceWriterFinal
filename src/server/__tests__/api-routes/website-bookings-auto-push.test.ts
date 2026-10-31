import "../../../test/api-routes/env";

/**
 * Prepaid auto-push — service-level tests for executeAutoPush, which is
 * the manual push pipeline (executePushes) in auto_prepaid mode. The
 * website-backend client is mocked (no network to the backend), the
 * Supabase client is a fake (no database), and Mapbox geocoding is a
 * mocked global fetch. What is asserted is the pipeline's behavior:
 * which RPC runs, what gets stamped, and what creates nothing.
 */
jest.mock("@/server/website-bookings/client", () => {
  class WebsiteBackendError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "WebsiteBackendError";
      this.status = status;
    }
  }
  return {
    WebsiteBackendError,
    getWebsiteBookingsConfig: jest.fn(() => ({ baseUrl: "https://backend.test", secret: "test-secret" })),
    fetchWebsiteBookings: jest.fn(),
    stampWebsiteBookingPushed: jest.fn(async () => ({})),
    recordWebsiteBookingAutoPushFailure: jest.fn(async () => ({})),
    setWebsiteBookingNeverPush: jest.fn(async () => ({})),
    websiteIntegrationNotConfigured: jest.fn(() => new WebsiteBackendError(503, "not configured")),
  };
});

import * as client from "@/server/website-bookings/client";
import { executeAutoPush, executePushes } from "@/server/website-bookings/service";
import type { WebsiteBooking } from "@/lib/website-bookings";

const WS_ID = "11111111-1111-4111-8111-111111111111";
const CATALOG_ID = "77777777-7777-4777-8777-777777777777";
const CREATED_ID = "a1111111-1111-4111-8111-111111111111";
const EXISTING_APPT_ID = "b2222222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "c3333333-3333-4333-8333-333333333333";
const VEHICLE_ID = "d4444444-4444-4444-8444-444444444444";
const NEW_VEHICLE_ID = "e5555555-5555-4555-8555-555555555555";

const fetchBookings = client.fetchWebsiteBookings as jest.Mock;
const stampPushed = client.stampWebsiteBookingPushed as jest.Mock;
const recordFailure = client.recordWebsiteBookingAutoPushFailure as jest.Mock;

let bookingSeq = 0;
const booking = (overrides: Partial<WebsiteBooking> = {}): WebsiteBooking => {
  bookingSeq += 1;
  return {
    id: `e529c941-9f5e-4dce-be31-88ab334165d${String(bookingSeq).padStart(2, "0")}`,
    customer: "Laurenza Giosa",
    email: "lgiosa25@gmail.com",
    phone: "2673421140",
    address: "1323 n tulip drive, West chester, PA 19380",
    payment: "paid",
    quoted_total_usd: 122.57,
    scheduled_start: "2026-10-21T08:00:00-04:00",
    scheduled_end: "2026-10-21T09:00:00-04:00",
    service: "Full Synthetic Oil Change",
    source_channel: null,
    status: "confirmed",
    vehicle: { year: 2025, make: "Toyota", model: "Land Cruiser", engine: "Turbo 2.4" },
    ...overrides,
  };
};

interface FakeItem {
  id: string;
  quantity: number;
  unit_price: number;
  metadata: Record<string, unknown>;
}

interface FakeVehicle {
  id: string;
  customer_id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}

interface FakeState {
  unpushed: WebsiteBooking[];
  pushed: WebsiteBooking[];
  catalog: Array<{ id: string; name: string }>;
  dayAppointments: unknown[];
  geocodeFeatures: unknown[];
  /** appointment_items rows for the created appointment (stateful: the
   * RPC seeds one item, normalization replaces it). */
  items: FakeItem[];
  vehicles: FakeVehicle[];
}

function makeFakeSupabase(state: FakeState) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const builder = (listResult: unknown, singleResult: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "in", "gte", "lte", "order", "limit", "insert", "update", "upsert"]) {
      b[m] = jest.fn(() => b);
    }
    b.delete = jest.fn(() => b);
    b.maybeSingle = jest.fn(async () => singleResult);
    b.single = jest.fn(async () => singleResult);
    b.then = (resolve: (value: unknown) => void) =>
      resolve(typeof listResult === "function" ? (listResult as () => unknown)() : listResult);
    return b;
  };
  const supabase = {
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      // The booking RPC creates the appointment + its one canonical item.
      state.items = [
        {
          id: "rpc-item-1",
          quantity: 1,
          unit_price: Number(args.p_quoted_total),
          metadata: {
            source: "website_push",
            price_source: "website_quote",
            website_booking_id: args.p_website_booking_id,
            vehicle_id: VEHICLE_ID,
          },
        },
      ];
      return { data: CREATED_ID, error: null };
    }),
    from: jest.fn((table: string) => {
      switch (table) {
        case "workspaces":
          return builder(null, { data: { timezone: "America/New_York", name: "MOMS" }, error: null });
        case "workspace_settings":
          return builder(null, { data: { booking_slug: "moms" }, error: null });
        case "customers":
          return builder({ data: [], error: null }, null);
        case "service_catalog":
          return builder({ data: state.catalog, error: null }, null);
        case "appointments":
          return builder({ data: state.dayAppointments, error: null }, {
            data: {
              id: CREATED_ID,
              workspace_id: WS_ID,
              customer_id: CUSTOMER_ID,
              vehicle_id: VEHICLE_ID,
              starts_at: "2026-10-21T12:00:00.000Z",
              ends_at: "2026-10-21T13:00:00.000Z",
              status: "confirmed",
              notes: null,
              confirmation_code: "TEST1234",
              metadata: { estimated_cost: 122.57, tax_amount: 0, title: "Full Synthetic Oil Change" },
            },
            error: null,
          });
        case "appointment_items": {
          const b = builder(() => ({ data: state.items, error: null }), null);
          b.insert = jest.fn(async (rows: Array<Omit<FakeItem, "id">>) => {
            state.items = rows.map((row, i) => ({ id: `normalized-item-${i}`, ...row }));
            return { error: null };
          });
          b.delete = jest.fn(() => {
            const chain: Record<string, unknown> = {};
            chain.eq = jest.fn(() => chain);
            chain.in = jest.fn(async (_column: string, ids: string[]) => {
              state.items = state.items.filter((item) => !ids.includes(item.id));
              return { error: null };
            });
            return chain;
          });
          return b;
        }
        case "vehicles": {
          const b = builder(() => ({ data: state.vehicles, error: null }), null);
          b.insert = jest.fn((row: Omit<FakeVehicle, "id">) => ({
            select: () => ({
              single: async () => {
                const created: FakeVehicle = { id: NEW_VEHICLE_ID, ...row };
                state.vehicles.push(created);
                return { data: { id: created.id }, error: null };
              },
            }),
          }));
          return b;
        }
        default:
          return builder({ data: [], error: null }, { data: null, error: null });
      }
    }),
  };
  return { supabase, rpcCalls };
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    unpushed: [],
    pushed: [],
    catalog: [{ id: CATALOG_ID, name: "Full Synthetic Oil Change" }],
    dayAppointments: [],
    geocodeFeatures: [{ center: [-75.6, 39.96] }],
    items: [],
    vehicles: [
      { id: VEHICLE_ID, customer_id: CUSTOMER_ID, vin: null, year: 2025, make: "Toyota", model: "Land Cruiser" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = `pk.${"x".repeat(30)}`;
  (client.getWebsiteBookingsConfig as jest.Mock).mockReturnValue({ baseUrl: "https://backend.test", secret: "test-secret" });
  stampPushed.mockResolvedValue({});
  recordFailure.mockResolvedValue({});
});

function wireState(state: FakeState) {
  fetchBookings.mockImplementation(async (_config: unknown, status: string) =>
    status === "pushed" ? state.pushed : state.unpushed,
  );
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ features: state.geocodeFeatures }),
  })) as unknown as typeof fetch;
  return makeFakeSupabase(state);
}

describe("executeAutoPush (auto-push pipeline)", () => {
  it("pushes a prepaid booking through the auto RPC at the locked quote and stamps it", async () => {
    const b = booking();
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("created");
    expect(result.appointment_id).toBe(CREATED_ID);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("public_booking_book_appointment_auto_v1");
    expect(rpcCalls[0].args.p_quoted_total).toBe(122.57);
    expect(rpcCalls[0].args.p_website_booking_id).toBe(b.id);
    expect(rpcCalls[0].args.p_service_catalog_id).toBe(CATALOG_ID);
    expect(stampPushed).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://backend.test" }), b.id, CREATED_ID);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("push writes ONLY the customer's own notes into the appointment (Ty's rule)", async () => {
    const b = booking({ notes: "  Gate code is 4242. Dog is friendly.  " });
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("created");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_notes).toBe("Gate code is 4242. Dog is friendly.");
  });

  it("push writes NO notes when the customer entered none — never the provenance line", async () => {
    const b = booking();
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("created");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_notes).toBeNull();
    expect(JSON.stringify(rpcCalls[0].args)).not.toMatch(/pushed from/i);
    // Provenance still reaches the RPC as its own params (stored in
    // appointment metadata by the RPC), just never as notes.
    expect(rpcCalls[0].args.p_website_booking_id).toBe(b.id);
    expect(rpcCalls[0].args.p_payment_status).toBe("paid");
  });

  it("duplicate trigger (webhook retry): the second call returns already_pushed and creates nothing", async () => {
    const b = booking();
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const first = await executeAutoPush(supabase, WS_ID, b.id);
    expect(first.status).toBe("created");

    // After the stamp, the backend serves the booking from the pushed list.
    state.unpushed = [];
    state.pushed = [{ ...b, pushed_sw_appointment_id: CREATED_ID, pushed_at: "2026-10-29T15:00:00.000Z" }];
    const second = await executeAutoPush(supabase, WS_ID, b.id);

    expect(second.status).toBe("already_pushed");
    expect(second.appointment_id).toBe(CREATED_ID);
    expect(rpcCalls).toHaveLength(1);
    expect(stampPushed).toHaveBeenCalledTimes(1);
  });

  it("concurrent double-fire joins one in-flight attempt", async () => {
    const b = booking();
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const [r1, r2] = await Promise.all([executeAutoPush(supabase, WS_ID, b.id), executeAutoPush(supabase, WS_ID, b.id)]);

    expect(r1.status).toBe("created");
    expect(r2.status).toBe("created");
    expect(rpcCalls).toHaveLength(1);
  });

  it("cancelled-before-push: not pushed, nothing created, nothing stamped", async () => {
    const b = booking({ status: "cancelled" });
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/cancelled/i);
    expect(rpcCalls).toHaveLength(0);
    expect(stampPushed).not.toHaveBeenCalled();
  });

  it("pay-at-appointment booking: the automatic path pushes it like a prepaid one (Ty's 2026-10-30 ruling)", async () => {
    const b = booking({ payment: "due_at_appointment" });
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("created");
    expect(result.appointment_id).toBe(CREATED_ID);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("public_booking_book_appointment_auto_v1");
    expect(stampPushed).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://backend.test" }), b.id, CREATED_ID);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("not push-ready (service does not resolve): blocked, failure recorded, still unstamped for the manual queue", async () => {
    const b = booking({ service: "Mystery Service" });
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/Mystery Service/);
    expect(rpcCalls).toHaveLength(0);
    expect(stampPushed).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith(expect.anything(), b.id, expect.stringContaining("Mystery Service"));
  });

  it("not push-ready (address cannot be geocoded): blocked and recorded, nothing created", async () => {
    const b = booking();
    const state = baseState({ unpushed: [b], geocodeFeatures: [] });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/geocoded/i);
    expect(rpcCalls).toHaveLength(0);
    expect(stampPushed).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledTimes(1);
  });

  it("same job already in Service Writer: Links to the existing appointment instead of creating a twin", async () => {
    const b = booking();
    const state = baseState({
      unpushed: [b],
      dayAppointments: [
        {
          id: EXISTING_APPT_ID,
          customer_id: "cust-1",
          vehicle_id: "veh-1",
          starts_at: "2026-10-21T12:00:00.000Z",
          ends_at: "2026-10-21T13:00:00.000Z",
          status: "confirmed",
          metadata: { guest_phone: "(267) 342-1140", title: "Full Synthetic Oil Change" },
          vehicles: { year: 2025, make: "Toyota", model: "Land Cruiser" },
        },
      ],
    });
    const { supabase, rpcCalls } = wireState(state);

    const result = await executeAutoPush(supabase, WS_ID, b.id);

    expect(result.status).toBe("linked");
    expect(result.appointment_id).toBe(EXISTING_APPT_ID);
    expect(rpcCalls).toHaveLength(0);
    expect(stampPushed).toHaveBeenCalledWith(expect.anything(), b.id, EXISTING_APPT_ID);
  });
});

describe("manual pipeline is unchanged by auto mode", () => {
  it("executePushes (manual) still uses the staff RPC and can push an unpaid booking at staff direction", async () => {
    const b = booking({ payment: "due_at_appointment" });
    const state = baseState({ unpushed: [b] });
    const { supabase, rpcCalls } = wireState(state);

    const [result] = await executePushes(supabase, WS_ID, [{ booking_id: b.id, action: "push" }]);

    expect(result.status).toBe("created");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("public_booking_book_appointment_staff_v1");
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("normalizes a two-job booking into per-vehicle items after the RPC creates the appointment", async () => {
    const b = booking({
      payment: "due_at_appointment",
      quoted_total_usd: 259.85,
      jobs: [
        {
          position: 0,
          service_id: "ws-svc-1",
          service_name: "Full Synthetic Oil Change",
          vehicle: { year: 2025, make: "Toyota", model: "Land Cruiser", engine: "Turbo 2.4", vin: null },
          subtotal_usd: 119,
          waste_fee_usd: 0,
          processing_fee_usd: 3.57,
          tax_usd: 0,
          total_usd: 122.57,
          duration_minutes: 45,
        },
        {
          position: 1,
          service_id: "ws-svc-1",
          service_name: "Full Synthetic Oil Change",
          vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: null, vin: null },
          subtotal_usd: 119,
          waste_fee_usd: 4,
          processing_fee_usd: 3.69,
          tax_usd: 10.59,
          total_usd: 137.28,
          duration_minutes: 45,
        },
      ],
    });
    const state = baseState({ unpushed: [b] });
    const { supabase } = wireState(state);

    const [result] = await executePushes(supabase, WS_ID, [{ booking_id: b.id, action: "push" }]);

    expect(result.status).toBe("created");
    // The second job's vehicle was created under the customer.
    expect(state.vehicles).toHaveLength(2);
    expect(state.vehicles[1].make).toBe("SUBARU");
    // Items: 2 service + job 1 processing + job 2 waste/processing/tax.
    const services = state.items.filter((i) => i.metadata.fee_key === undefined);
    const fees = state.items.filter((i) => i.metadata.fee_key !== undefined);
    expect(services).toHaveLength(2);
    expect(services.map((i) => i.metadata.vehicle_id)).toEqual([VEHICLE_ID, NEW_VEHICLE_ID]);
    expect(fees.map((f) => f.metadata.fee_key)).toEqual(["surcharge", "waste_oil_fee", "surcharge", "tax"]);
    expect(fees.filter((f) => f.metadata.job_position === 1).every((f) => f.metadata.vehicle_id === NEW_VEHICLE_ID)).toBe(true);
    const total = Math.round(state.items.reduce((acc, i) => acc + i.unit_price, 0) * 100) / 100;
    expect(total).toBe(259.85);
  });
});
