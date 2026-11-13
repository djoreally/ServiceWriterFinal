/**
 * Grey-box tests for GET /v1/dispatch/settings.
 * Drives the router over HTTP with Supabase + messaging pipelines mocked.
 *
 * The handler resolves the caller's workspace server-side from
 * workspace_members, then reads the workspace's business_profiles row.
 * A present row is returned as-is; a missing row returns data: null
 * (the Settings panel then renders its defaults).
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
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const appointmentsRouter = testRouter(appointmentsRouterRaw);

const PROFILE_ROW = {
  auto_dispatch_enabled: true,
  dispatch_weight_distance: 0.3,
  dispatch_weight_load: 0.2,
  dispatch_weight_performance: 0.2,
  dispatch_weight_fairness: 0.15,
  dispatch_weight_route: 0.15,
  dispatch_fleet_performance_threshold: 60,
};

beforeEach(() => {
  resetHarness();
  db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
});

describe("GET /v1/dispatch/settings", () => {
  it("returns the profile's dispatch settings when a row exists", async () => {
    db["business_profiles:single"] = { data: PROFILE_ROW, error: null };
    const res = await appointmentsRouter.request(
      `/v1/dispatch/settings?user_id=${USER_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(PROFILE_ROW);
  });

  it("returns data: null when the workspace has no profile row yet", async () => {
    db["business_profiles:single"] = { data: null, error: null };
    const res = await appointmentsRouter.request(
      `/v1/dispatch/settings?user_id=${USER_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("rejects a user_id that does not match the caller", async () => {
    db["business_profiles:single"] = { data: PROFILE_ROW, error: null };
    const res = await appointmentsRouter.request(
      `/v1/dispatch/settings?user_id=660e8400-e29b-41d4-a716-446655440999`,
    );
    expect(res.status).toBe(403);
  });
});
