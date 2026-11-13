/**
 * Grey-box tests for POST /v1/crm/testimonials/submit (NEED-1).
 *
 * The public testimonial page identifies the shop by booking slug + the
 * owner's user_id; testimonials.workspace_id is NOT NULL, so the handler
 * resolves the workspace server-side from workspace_settings.booking_slug
 * (the same join get_public_booking_profile_v2 uses) and stamps the
 * insert with the resolved id. A client-supplied workspace_id is never
 * honored; an unresolvable slug fails closed with a 404.
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

import { crmRouter as crmRouterRaw } from "@/server/hono/routes/crm";
import { testRouter } from "../test-support/routerTest";
import {
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
  WS_ID_2,
} from "../test-support/state";

const crmRouter = testRouter(crmRouterRaw);

const OTHER_USER_ID = "660e8400-e29b-41d4-a716-446655440099";

const body = {
  user_id: USER_ID,
  slug: "moms-mobile-oil",
  customer_name: "Jamie Customer",
  customer_email: null,
  content: "Fast, careful, and fairly priced.",
  rating: 5,
};

function seedSettings(overrides: {
  booking_enabled?: boolean;
  created_by?: string;
  is_active?: boolean;
} = {}): void {
  db["workspace_settings"] = {
    data: [
      {
        workspace_id: WS_ID,
        booking_enabled: overrides.booking_enabled ?? true,
        workspaces: {
          created_by: overrides.created_by ?? USER_ID,
          is_active: overrides.is_active ?? true,
        },
      },
    ],
    error: null,
  };
}

async function submit(payload: Record<string, unknown>) {
  return crmRouter.request("/v1/crm/testimonials/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  resetHarness();
});

describe("POST /v1/crm/testimonials/submit (NEED-1)", () => {
  it("resolves the workspace from the slug and stamps the insert with it", async () => {
    seedSettings();
    const res = await submit(body);
    expect(res.status).toBe(201);
    expect((await res.json()).data.submitted).toBe(true);
    const insert = calls.inserts.find((i) => i.table === "testimonials");
    expect(insert).toBeDefined();
    expect(insert!.rows).toEqual({
      user_id: USER_ID,
      workspace_id: WS_ID,
      customer_name: body.customer_name,
      customer_email: null,
      content: body.content,
      rating: 5,
      status: "pending",
    });
  });

  it("never honors a client-supplied workspace_id", async () => {
    seedSettings();
    const res = await submit({ ...body, workspace_id: WS_ID_2 });
    expect(res.status).toBe(201);
    const insert = calls.inserts.find((i) => i.table === "testimonials");
    expect(insert).toBeDefined();
    expect((insert!.rows as Record<string, unknown>).workspace_id).toBe(WS_ID);
    expect(JSON.stringify(insert!.rows)).not.toContain(WS_ID_2);
  });

  it("fails closed with a 404 when the slug resolves to nothing", async () => {
    db["workspace_settings"] = { data: [], error: null };
    const res = await submit(body);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("business_not_found");
    expect(calls.inserts).toHaveLength(0);
  });

  it("fails closed when the slug's workspace belongs to a different owner", async () => {
    seedSettings({ created_by: OTHER_USER_ID });
    const res = await submit(body);
    expect(res.status).toBe(404);
    expect(calls.inserts).toHaveLength(0);
  });

  it("fails closed when booking is disabled for the slug's workspace", async () => {
    seedSettings({ booking_enabled: false });
    const res = await submit(body);
    expect(res.status).toBe(404);
    expect(calls.inserts).toHaveLength(0);
  });

  it("fails closed when the slug's workspace is inactive", async () => {
    seedSettings({ is_active: false });
    const res = await submit(body);
    expect(res.status).toBe(404);
    expect(calls.inserts).toHaveLength(0);
  });
});
