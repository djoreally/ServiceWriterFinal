/**
 * Grey-box tests for the built-in telemetry Hono router.
 *
 * Covers both ingest streams (signed-in app activity + public booking
 * funnel) and the owner-tier reads (workspace timeline, funnel
 * analytics with lost bookings, service insight, platform-admin
 * cross-platform activity). Drives the router over HTTP with the
 * Supabase layer mocked — no network.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
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

import { telemetryRouter as telemetryRouterRaw } from "@/server/hono/routes/telemetry";
import { testRouter } from "../test-support/routerTest";

const telemetryRouter = testRouter(telemetryRouterRaw);
import {
  authState,
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
  WS_ID_2,
} from "../test-support/state";

const SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";

function post(path: string, payload: unknown) {
  return telemetryRouter.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1" },
    body: JSON.stringify(payload),
  });
}

function pageviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    visitor_id: "visitor-1",
    event_type: "pageview",
    url: "https://app.servicewriter.xyz/customers",
    title: "Customers",
    occurred_at: "2026-11-12T17:00:00.000Z",
    viewport_width: 390,
    viewport_height: 844,
    device_class: "mobile",
    ...overrides,
  };
}

beforeEach(() => {
  resetHarness();
  // The ingest resolves workspace + role from the caller's memberships.
  db.workspace_members = {
    data: [{ workspace_id: WS_ID, role: "viewer", is_active: true }],
    error: null,
  };
});

describe("POST /v1/telemetry/events (signed-in stream)", () => {
  it("rejects unauthenticated writes with 401 and records nothing", async () => {
    authState.mode = "unauthorized";
    const res = await post("/v1/telemetry/events", pageviewPayload());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthenticated");
    expect(calls.inserts.filter((call) => call.table === "telemetry_events")).toHaveLength(0);
  });

  it("rejects an unknown event type with 400", async () => {
    const res = await post("/v1/telemetry/events", pageviewPayload({ event_type: "hover" }));
    expect(res.status).toBe(400);
    expect(calls.inserts.filter((call) => call.table === "telemetry_events")).toHaveLength(0);
  });

  it("lands a pageview stamped with the session user, email, workspace and role", async () => {
    const res = await post("/v1/telemetry/events", pageviewPayload());
    expect(res.status).toBe(200);

    const sessionInsert = calls.inserts.find((call) => call.table === "telemetry_sessions");
    expect(sessionInsert).toBeTruthy();
    const sessionRow = sessionInsert!.rows as Record<string, unknown>;
    expect(sessionRow.id).toBe(SESSION_ID);
    expect(sessionRow.stream).toBe("app");
    expect(sessionRow.user_id).toBe(USER_ID);
    expect(sessionRow.user_email).toBe("tech@example.com");
    expect(sessionRow.workspace_id).toBe(WS_ID);
    expect(sessionRow.role).toBe("viewer");
    expect(sessionRow.browser).toBe("Safari");
    expect(sessionRow.pageviews).toBe(1);

    const eventInsert = calls.inserts.find((call) => call.table === "telemetry_events");
    expect(eventInsert).toBeTruthy();
    const eventRow = eventInsert!.rows as Record<string, unknown>;
    expect(eventRow.session_id).toBe(SESSION_ID);
    expect(eventRow.event_type).toBe("pageview");
    expect(eventRow.path).toBe("/customers");
    expect(eventRow.user_id).toBe(USER_ID);
    expect(eventRow.user_email).toBe("tech@example.com");
    expect(eventRow.workspace_id).toBe(WS_ID);
    expect(eventRow.role).toBe("viewer");
  });

  it("ignores a client-sent workspace the caller is not a member of", async () => {
    const res = await post("/v1/telemetry/events", pageviewPayload({ workspace_id: WS_ID_2 }));
    expect(res.status).toBe(200);
    const eventInsert = calls.inserts.find((call) => call.table === "telemetry_events");
    const eventRow = eventInsert!.rows as Record<string, unknown>;
    // Falls back to the caller's real (only) membership — never the lie.
    expect(eventRow.workspace_id).toBe(WS_ID);
  });
});

describe("POST /v1/telemetry/public-events (booking funnel stream)", () => {
  beforeEach(() => {
    db.workspaces = { data: { id: WS_ID, is_active: true }, error: null };
    db["workspaces:single"] = { data: { id: WS_ID, is_active: true }, error: null };
  });

  it("rejects a funnel event without any workspace identity", async () => {
    const res = await post("/v1/telemetry/public-events", {
      session_id: "funnel-1",
      event_type: "funnel_step",
      funnel_step: "landing",
      url: "https://shop.servicewriter.xyz/book/demo",
    });
    expect(res.status).toBe(400);
    expect(calls.inserts.filter((call) => call.table === "telemetry_events")).toHaveLength(0);
  });

  it("rejects an unknown funnel step", async () => {
    const res = await post("/v1/telemetry/public-events", {
      session_id: "funnel-1",
      workspace_id: WS_ID,
      event_type: "funnel_step",
      funnel_step: "teleport",
      url: "https://shop.servicewriter.xyz/book/demo",
    });
    expect(res.status).toBe(400);
  });

  it("emits an ordered journey under one session id, workspace stamped, identity empty", async () => {
    const steps = ["landing", "address", "vehicle", "service", "time", "details", "payment"] as const;
    for (const [index, step] of steps.entries()) {
      const res = await post("/v1/telemetry/public-events", {
        session_id: "funnel-1",
        visitor_id: "visitor-9",
        workspace_id: WS_ID,
        event_type: "funnel_step",
        funnel_step: step,
        url: `https://shop.servicewriter.xyz/book/demo?step=${index + 1}`,
        occurred_at: `2026-11-12T17:0${index}:00.000Z`,
      });
      expect(res.status).toBe(200);
    }
    const confirmed = await post("/v1/telemetry/public-events", {
      session_id: "funnel-1",
      visitor_id: "visitor-9",
      workspace_id: WS_ID,
      event_type: "booking_confirmed",
      funnel_step: "confirmed",
      url: "https://shop.servicewriter.xyz/book/demo?step=6",
      occurred_at: "2026-11-12T17:09:00.000Z",
      metadata: { quote_total: 133.83, services: [{ id: "svc-1", name: "Full Synthetic", price: 119 }] },
    });
    expect(confirmed.status).toBe(200);

    const events = calls.inserts
      .filter((call) => call.table === "telemetry_events")
      .map((call) => call.rows as Record<string, unknown>);
    expect(events).toHaveLength(8);
    expect(events.map((row) => row.funnel_step)).toEqual([...steps, "confirmed"]);
    for (const row of events) {
      expect(row.session_id).toBe("funnel-1");
      expect(row.visitor_id).toBe("visitor-9");
      expect(row.workspace_id).toBe(WS_ID);
      expect(row.stream).toBe("booking");
      expect(row.user_id).toBeNull();
      expect(row.user_email).toBeNull();
    }
    const confirmRow = events[events.length - 1];
    expect(confirmRow.event_type).toBe("booking_confirmed");
    expect((confirmRow.metadata as { quote_total: number }).quote_total).toBe(133.83);
  });
});

describe("GET /v1/telemetry/events (workspace timeline)", () => {
  it("lets a workspace owner read the timeline", async () => {
    authState.role = "owner";
    db.telemetry_events = { data: [{ id: "e1", event_type: "pageview", path: "/customers" }], error: null };
    const res = await telemetryRouter.request(`/v1/telemetry/events?workspace_id=${WS_ID}&user_id=${USER_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it("rejects a non-admin workspace member (a viewer cannot read anyone's activity)", async () => {
    authState.role = "viewer";
    const res = await telemetryRouter.request(`/v1/telemetry/events?workspace_id=${WS_ID}`);
    expect(res.status).toBe(403);
  });

  it("rejects a member of another workspace reading this workspace's events", async () => {
    authState.mode = "forbidden";
    authState.role = "owner";
    const res = await telemetryRouter.request(`/v1/telemetry/events?workspace_id=${WS_ID}`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});

describe("GET /v1/telemetry/funnel (owner analytics)", () => {
  const sessions = [
    {
      id: "journey-confirmed",
      visitor_id: "v-1",
      started_at: "2026-11-10T15:00:00.000Z",
      last_seen_at: "2026-11-10T15:09:00.000Z",
      entry_url: "https://shop.servicewriter.xyz/book/demo",
      referrer: "https://www.google.com/",
      utm_source: null,
      pageviews: 6,
      engaged_ms: 300000,
    },
    {
      id: "journey-lost",
      visitor_id: "v-2",
      started_at: "2026-11-11T16:00:00.000Z",
      last_seen_at: "2026-11-11T16:04:00.000Z",
      entry_url: "https://shop.servicewriter.xyz/book/demo",
      referrer: null,
      utm_source: "facebook",
      pageviews: 3,
      engaged_ms: 120000,
    },
  ];
  const stepRows = [
    { session_id: "journey-confirmed", funnel_step: "landing", occurred_at: "2026-11-10T15:00:00.000Z" },
    { session_id: "journey-confirmed", funnel_step: "service", occurred_at: "2026-11-10T15:02:00.000Z" },
    { session_id: "journey-confirmed", funnel_step: "payment", occurred_at: "2026-11-10T15:07:00.000Z" },
    { session_id: "journey-confirmed", funnel_step: "confirmed", occurred_at: "2026-11-10T15:09:00.000Z" },
    { session_id: "journey-lost", funnel_step: "landing", occurred_at: "2026-11-11T16:00:00.000Z" },
    { session_id: "journey-lost", funnel_step: "service", occurred_at: "2026-11-11T16:02:00.000Z" },
    { session_id: "journey-lost", funnel_step: "time", occurred_at: "2026-11-11T16:04:00.000Z" },
  ];

  beforeEach(() => {
    authState.role = "owner";
    // The sessions query and the step-rows query both read
    // telemetry_events/telemetry_sessions through the same mock table
    // map: sessions come from telemetry_sessions, steps from
    // telemetry_events.
    db.telemetry_sessions = { data: sessions, error: null };
    db.telemetry_events = { data: stepRows, error: null };
  });

  it("computes conversion, drop-off, cohorts — and lost bookings are started-not-confirmed only", async () => {
    const res = await telemetryRouter.request(`/v1/telemetry/funnel?workspace_id=${WS_ID}&days=30`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        steps: Array<{ step: string; sessions: number; dropoff_from_previous: number }>;
        totals: { journeys: number; confirmed: number; conversion_rate: number };
        lost_bookings: Array<{ session_id: string; last_step: string; entry_source: string }>;
        cohorts: { by_source: Array<{ source: string; journeys: number }> };
      };
    };
    expect(body.data.totals).toEqual({ journeys: 2, confirmed: 1, conversion_rate: 0.5 });
    const landing = body.data.steps.find((row) => row.step === "landing");
    const confirmedStep = body.data.steps.find((row) => row.step === "confirmed");
    const detailsStep = body.data.steps.find((row) => row.step === "details");
    expect(landing?.sessions).toBe(2);
    expect(confirmedStep?.sessions).toBe(1);
    // The lost journey fell off between time and details.
    expect(detailsStep?.sessions).toBe(1);
    expect(detailsStep?.dropoff_from_previous).toBe(1);

    // The confirmed journey must NOT appear as lost; the lost one must,
    // with its last step and entry source.
    expect(body.data.lost_bookings).toHaveLength(1);
    expect(body.data.lost_bookings[0].session_id).toBe("journey-lost");
    expect(body.data.lost_bookings[0].last_step).toBe("time");
    expect(body.data.lost_bookings[0].entry_source).toBe("facebook");
    expect(body.data.cohorts.by_source.map((row) => row.source).sort()).toEqual(["facebook", "www.google.com"]);
  });

  it("rejects an owner of another workspace reading this funnel", async () => {
    authState.mode = "forbidden";
    const res = await telemetryRouter.request(`/v1/telemetry/funnel?workspace_id=${WS_ID}`);
    expect(res.status).toBe(403);
  });

  it("rejects a non-admin member reading the funnel", async () => {
    authState.role = "technician";
    const res = await telemetryRouter.request(`/v1/telemetry/funnel?workspace_id=${WS_ID}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /v1/telemetry/services (viewed / unbought insight)", () => {
  it("ranks services by viewed sessions and counts viewed-not-bought", async () => {
    authState.role = "owner";
    db.telemetry_events = {
      data: [
        { session_id: "s1", event_type: "service_viewed", metadata: { services: [{ id: "svc-1", name: "Full Synthetic", price: 119 }] } },
        { session_id: "s2", event_type: "service_viewed", metadata: { services: [{ id: "svc-1", name: "Full Synthetic", price: 119 }] } },
        { session_id: "s1", event_type: "service_selected", metadata: { services: [{ id: "svc-1", name: "Full Synthetic", price: 119 }] } },
        { session_id: "s1", event_type: "booking_confirmed", metadata: {} },
      ],
      error: null,
    };
    const res = await telemetryRouter.request(`/v1/telemetry/services?workspace_id=${WS_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      service_id: "svc-1",
      service_name: "Full Synthetic",
      price: 119,
      viewed_sessions: 2,
      selected_sessions: 1,
      confirmed_sessions: 1,
      viewed_not_bought_sessions: 1,
    });
  });
});

describe("GET /v1/telemetry/platform/user-activity (platform admin)", () => {
  it("lets a platform admin read a user's cross-workspace activity", async () => {
    db.user_roles = { data: { role: "admin" }, error: null };
    db["user_roles:single"] = { data: { role: "admin" }, error: null };
    db.telemetry_events = { data: [{ id: "e1", user_id: USER_ID, path: "/dashboard" }], error: null };
    const res = await telemetryRouter.request(
      `/v1/telemetry/platform/user-activity?user_email=kdavis3290@gmail.com`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it("rejects a signed-in user who is not a platform admin", async () => {
    db.user_roles = { data: null, error: null };
    db["user_roles:single"] = { data: null, error: null };
    const res = await telemetryRouter.request(
      `/v1/telemetry/platform/user-activity?user_id=${USER_ID}`,
    );
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated callers", async () => {
    authState.mode = "unauthorized";
    const res = await telemetryRouter.request(
      `/v1/telemetry/platform/user-activity?user_id=${USER_ID}`,
    );
    expect(res.status).toBe(401);
  });
});
