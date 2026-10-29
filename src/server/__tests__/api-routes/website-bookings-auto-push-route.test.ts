import "../../../test/api-routes/env";

/**
 * Internal auto-push endpoint — POST /internal/website-bookings/auto-push.
 * This is the server-to-server door the website backend calls when a
 * booking's prepayment completes. The push service and the Supabase
 * admin client are mocked; what is asserted is the door itself: shared
 * secret auth, honest 503s when unconfigured, and that a valid call
 * reaches executeAutoPush for the configured workspace only.
 */
jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(() => ({ __admin: true })),
}));
jest.mock("@/server/website-bookings/service", () => ({
  executeAutoPush: jest.fn(),
  executePushes: jest.fn(),
  listWebsiteBookingsQueue: jest.fn(),
  preparePushes: jest.fn(),
  setNeverPush: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { executeAutoPush } from "@/server/website-bookings/service";
import { websiteBookingsRouter } from "@/server/hono/routes/website-bookings";
import { testRouter } from "../../hono/test-support/routerTest";
import { readJson } from "../../../test/api-routes/helpers";

const app = testRouter(websiteBookingsRouter);
const WS_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "e529c941-9f5e-4dce-be31-88ab334165d7";
const APPOINTMENT_ID = "a1111111-1111-4111-8111-111111111111";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SW_PUSH_SECRET = "shared-test-secret";
  process.env.WEBSITE_BOOKINGS_WORKSPACE_ID = WS_ID;
  (executeAutoPush as jest.Mock).mockResolvedValue({
    booking_id: BOOKING_ID,
    status: "created",
    appointment_id: APPOINTMENT_ID,
    message: "Appointment created in Service Writer at the website quote.",
  });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function callAutoPush(secret: string | null, body: unknown = { booking_id: BOOKING_ID }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-sw-push-secret"] = secret;
  return app.request("/internal/website-bookings/auto-push", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /internal/website-bookings/auto-push", () => {
  it("rejects a wrong secret with 401 and never reaches the pipeline", async () => {
    const { status, body } = await readJson(await callAutoPush("wrong-secret"));
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(executeAutoPush).not.toHaveBeenCalled();
  });

  it("rejects a missing secret header with 401", async () => {
    const { status } = await readJson(await callAutoPush(null));
    expect(status).toBe(401);
    expect(executeAutoPush).not.toHaveBeenCalled();
  });

  it("returns 503 when the shared secret is not configured on the server", async () => {
    delete process.env.SW_PUSH_SECRET;
    const { status, body } = await readJson(await callAutoPush("anything"));
    expect(status).toBe(503);
    expect(body.error.code).toBe("auto_push_not_configured");
    expect(executeAutoPush).not.toHaveBeenCalled();
  });

  it("returns 503 when the website-bookings workspace is not configured", async () => {
    delete process.env.WEBSITE_BOOKINGS_WORKSPACE_ID;
    const { status, body } = await readJson(await callAutoPush("shared-test-secret"));
    expect(status).toBe(503);
    expect(body.error.code).toBe("auto_push_not_configured");
    expect(executeAutoPush).not.toHaveBeenCalled();
  });

  it("runs the auto-push for the configured workspace with the service-role client", async () => {
    const { status, body } = await readJson(await callAutoPush("shared-test-secret"));
    expect(status).toBe(200);
    expect(body.data.status).toBe("created");
    expect(body.data.appointment_id).toBe(APPOINTMENT_ID);
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(executeAutoPush).toHaveBeenCalledWith({ __admin: true }, WS_ID, BOOKING_ID);
  });

  it("passes an already-pushed duplicate result through unchanged", async () => {
    (executeAutoPush as jest.Mock).mockResolvedValue({
      booking_id: BOOKING_ID,
      status: "already_pushed",
      appointment_id: APPOINTMENT_ID,
      message: `Already pushed as appointment ${APPOINTMENT_ID}.`,
    });
    const { status, body } = await readJson(await callAutoPush("shared-test-secret"));
    expect(status).toBe(200);
    expect(body.data.status).toBe("already_pushed");
    expect(body.data.appointment_id).toBe(APPOINTMENT_ID);
  });
});
