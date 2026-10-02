/**
 * Shop Agent Phase 1 — booking seam tests.
 * Supabase is mocked; no live DB.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../../hono/test-support/webGlobals";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});

import { bookAppointmentCore } from "../../appointments/book-appointment";
import {
  bookAppointmentAsAgent,
  findOrCreateCustomerByPhone,
  getAvailableSlots,
  bookingPort,
} from "../booking";

// ---------------------------------------------------------------------------
// Chainable supabase mock with call recording.
// ---------------------------------------------------------------------------

type SeedEntry = { data: any; error: any } | ((ctx: { table: string; op: string }) => { data: any; error: any });

function mockSupabase(seed: Record<string, SeedEntry>) {
  const calls: Array<{ table: string; op: string; payload?: any }> = [];
  const client: any = {
    from(table: string) {
      const builder: any = {
        select(cols?: string) { calls.push({ table, op: "select", payload: cols }); return builder; },
        eq() { return builder; },
        neq() { return builder; },
        not() { return builder; },
        lt() { return builder; },
        gt() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        range() { return builder; },
        maybeSingle() { return resolve("single"); },
        single() { return resolve("single"); },
        insert(rows: any) {
          calls.push({ table, op: "insert", payload: rows });
          return { select: () => ({ single: () => resolve("insert") }) };
        },
        then(onFulfilled: any, onRejected: any) {
          return resolve("query").then(onFulfilled, onRejected);
        },
      };
      function resolve(op: string) {
        const entry = seed[`${table}:${op}`] ?? seed[table];
        const res =
          typeof entry === "function"
            ? (entry as (ctx: { table: string; op: string }) => { data: any; error: any })({ table, op })
            : entry;
        return Promise.resolve(res ?? { data: null, error: null });
      }
      return builder;
    },
  };
  return { client, calls };
}

const WS_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
// Monday 2026-10-05; America/New_York is UTC-4 (EDT).
const MON_10AM_ET = "2026-10-05T14:00:00Z";
const MON_11AM_ET = "2026-10-05T15:00:00Z";
const SUN_10AM_ET = "2026-10-04T14:00:00Z";
const SUN_11AM_ET = "2026-10-04T15:00:00Z";

function mondaySettings() {
  return {
    data: {
      day_hours: {},
      working_days: ["Monday"],
      opening_time: "09:00:00",
      closing_time: "17:00:00",
      buffer_time_before: 0,
      buffer_time_after: 0,
      min_lead_time_hours: 0,
      max_advance_days: 30,
      slot_duration_minutes: 60,
    },
    error: null,
  };
}

function validCustomer() {
  return { data: { id: CUSTOMER_ID, status: "active" }, error: null };
}

async function errorCode(result: { data: unknown } | { error: Response }) {
  expect("error" in result).toBe(true);
  const err = (result as { error: Response }).error;
  return { status: err.status, body: await err.json() };
}

describe("bookAppointmentCore", () => {
  it("rejects an unknown customer with invalid_customer", async () => {
    const { client } = mockSupabase({ "customers": { data: null, error: null } });
    const result = await bookAppointmentCore(client, {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      starts_at: MON_10AM_ET,
      ends_at: MON_11AM_ET,
    });
    const { status, body } = await errorCode(result);
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_customer");
  });

  it("rejects a slot outside business hours", async () => {
    const { client } = mockSupabase({
      "customers": validCustomer(),
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
    });
    const result = await bookAppointmentCore(client, {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      starts_at: SUN_10AM_ET,
      ends_at: SUN_11AM_ET,
    });
    const { status, body } = await errorCode(result);
    expect(status).toBe(409);
    expect(body.error.code).toBe("outside_business_hours");
  });

  it("rejects a slot that conflicts with an existing appointment", async () => {
    const { client } = mockSupabase({
      "customers": validCustomer(),
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
      "workspace_blackout_dates": { data: [], error: null },
      "appointments:query": { data: [{ id: "existing-appt" }], error: null },
    });
    const result = await bookAppointmentCore(client, {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      starts_at: MON_10AM_ET,
      ends_at: MON_11AM_ET,
    });
    const { status, body } = await errorCode(result);
    expect(status).toBe(409);
    expect(body.error.code).toBe("schedule_conflict");
  });

  it("inserts on the happy path with created_by null by default", async () => {
    const { client, calls } = mockSupabase({
      "customers": validCustomer(),
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
      "workspace_blackout_dates": { data: [], error: null },
      "appointments:query": { data: [], error: null },
      "appointments:insert": { data: { id: "new-appt", status: "confirmed" }, error: null },
    });
    const result = await bookAppointmentCore(client, {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      starts_at: MON_10AM_ET,
      ends_at: MON_11AM_ET,
    });
    expect("data" in result).toBe(true);
    expect((result as { data: any }).data.id).toBe("new-appt");
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.table).toBe("appointments");
    expect(insert?.payload.created_by).toBeNull();
  });
});

describe("bookAppointmentAsAgent", () => {
  it("books through the shared core with source shop-agent-sms", async () => {
    const { client, calls } = mockSupabase({
      "customers": validCustomer(),
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
      "workspace_blackout_dates": { data: [], error: null },
      "appointments:query": { data: [], error: null },
      "appointments:insert": { data: { id: "agent-appt", status: "confirmed" }, error: null },
    });
    const result = await bookAppointmentAsAgent(client, WS_ID, {
      customerId: CUSTOMER_ID,
      startsAt: MON_10AM_ET,
      endsAt: MON_11AM_ET,
      notes: "SMS booking",
    });
    expect("data" in result).toBe(true);
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.payload.source).toBe("shop-agent-sms");
    expect(insert?.payload.status).toBe("confirmed");
    expect(insert?.payload.notes).toBe("SMS booking");
  });

  it("returns the core error (no throw) so the caller can hand off", async () => {
    const { client } = mockSupabase({ "customers": { data: null, error: null } });
    const result = await bookAppointmentAsAgent(client, WS_ID, {
      customerId: CUSTOMER_ID,
      startsAt: MON_10AM_ET,
      endsAt: MON_11AM_ET,
    });
    const { body } = await errorCode(result);
    expect(body.error.code).toBe("invalid_customer");
  });
});

describe("findOrCreateCustomerByPhone", () => {
  it("finds an existing customer by phone", async () => {
    const { client, calls } = mockSupabase({
      "customers": { data: { id: "cust-1", first_name: "Tyreese" }, error: null },
    });
    const result = await findOrCreateCustomerByPhone(client, WS_ID, "+12157672125", "Tyreese Burton");
    expect(result).toEqual({ id: "cust-1", created: false });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("creates a minimal customer when the phone is unknown", async () => {
    const { client, calls } = mockSupabase({
      "customers:query": { data: null, error: null },
      "customers:single": { data: null, error: null },
      "customers:insert": { data: { id: "cust-2" }, error: null },
    });
    const result = await findOrCreateCustomerByPhone(client, WS_ID, "(215) 767-2125", "Tyreese Burton");
    expect(result).toEqual({ id: "cust-2", created: true });
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.payload).toMatchObject({
      workspace_id: WS_ID,
      first_name: "Tyreese",
      last_name: "Burton",
      phone: "2157672125",
    });
    expect(insert?.payload.metadata.source).toBe("shop-agent-sms");
  });
});

describe("getAvailableSlots", () => {
  beforeEach(() => {
    // Freeze time: Monday 2026-10-05 08:00 EDT (before opening).
    jest.useFakeTimers().setSystemTime(new Date("2026-10-05T12:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("excludes booked windows and returns labeled slots", async () => {
    const { client, calls } = mockSupabase({
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
      "service_catalog": { data: { id: "svc-1", estimated_minutes: 60 }, error: null },
      "workspace_blackout_dates": { data: [], error: null },
      // One booked appointment Mon 10:00-11:00 EDT.
      "appointments": { data: [{ starts_at: MON_10AM_ET, ends_at: MON_11AM_ET }], error: null },
    });
    const slots = await getAvailableSlots(client, WS_ID, "svc-1", 7);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.label)).toEqual(["Mon 9:00 AM", "Mon 11:00 AM", "Mon 12:00 PM"]);
    expect(slots[0].startsAt).toBe("2026-10-05T13:00:00.000Z");
    expect(slots[0].endsAt).toBe("2026-10-05T14:00:00.000Z");
    // Read-only: no inserts anywhere.
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("skips blackout dates and closed days", async () => {
    const { client } = mockSupabase({
      "workspaces": { data: { timezone: "America/New_York" }, error: null },
      "workspace_settings": mondaySettings(),
      "service_catalog": { data: { id: "svc-1", estimated_minutes: 60 }, error: null },
      "workspace_blackout_dates": { data: [{ blocked_date: "2026-10-05" }], error: null },
      "appointments": { data: [], error: null },
    });
    // 2026-10-05 (Mon) is blacked out; next Monday is 2026-10-12.
    const slots = await getAvailableSlots(client, WS_ID, "svc-1", 8);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].startsAt.startsWith("2026-10-12")).toBe(true);
  });
});

describe("bookingPort", () => {
  it("exposes the seam Worker C expects", () => {
    expect(bookingPort.getSlots).toBe(getAvailableSlots);
    expect(bookingPort.book).toBe(bookAppointmentAsAgent);
    expect(bookingPort.findOrCreateCustomer).toBe(findOrCreateCustomerByPhone);
  });
});
