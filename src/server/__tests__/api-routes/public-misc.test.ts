import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/server/messaging/resend", () => ({ ResendEmailAdapter: jest.fn() }));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: jest.fn(),
  LIFECYCLE_EVENT_KEYS: { reviewRequest: "review_request" },
}));
jest.mock("node:fs/promises", () => ({
  ...jest.requireActual("node:fs/promises"),
  readFile: jest.fn(),
}));

import * as api from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { dispatchLifecycleEvent } from "@/server/messaging/lifecycle-events";
import { readFile } from "node:fs/promises";

import { GET as pushKeyGet } from "../../../../app/api/notifications/push/public-key/route";
import { GET as healthGet } from "../../../../app/api/v1/health/route";
import { POST as catalogPost } from "../../../../app/api/v1/public-vehicle-catalog/route";
import { GET as prefsGet, POST as prefsPost } from "../../../../app/api/v1/newsletter/preferences/route";
import { POST as reviewsPost } from "../../../../app/api/v1/reviews/actions/route";
import { POST as emailTestPost } from "../../../../app/api/v1/email-testing/send/route";
import { GET as identityGet } from "../../../../app/api/v1/identity/route";
import { GET as workforceGet, POST as workforcePost } from "../../../../app/api/v1/workforce-identity/route";
import { GET as workspacesGet } from "../../../../app/api/v1/workspaces/route";
import { GET as commandCenterGet } from "../../../../app/api/v1/command-center/route";
import { GET as serviceCatalogGet } from "../../../../app/api/v1/service-catalog/route";

import {
  makeRequest,
  readJson,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  stubRequireUser,
  stubRequireUserReject,
  WS_ID,
  USER_ID,
  TEST_USER,
} from "../../../test/api-routes/helpers";

// node-fetch v2 (installed by _env) has no Request.formData(). The newsletter
// preferences route only calls form.get(), so shim it over a urlencoded body.
const RequestProto = (globalThis as unknown as { Request: { prototype: Record<string, unknown> } }).Request.prototype;
if (typeof RequestProto.formData !== "function") {
  RequestProto.formData = async function (this: Request) {
    const params = new URLSearchParams(await this.text());
    return { get: (name: string) => params.get(name) };
  };
}

function makeFormRequest(path: string, fields: Record<string, string>): Request {
  return new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

const createAdminMock = createSupabaseAdminClient as jest.Mock;
const ResendAdapterMock = ResendEmailAdapter as unknown as jest.Mock;
const dispatchLifecycleMock = dispatchLifecycleEvent as jest.Mock;
const readFileMock = readFile as unknown as jest.Mock;
const mockResendSend = jest.fn();

const SR_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "55555555-5555-4555-8555-555555555555";
const APPT_ID = "66666666-6666-4666-8666-666666666666";
const PREFS_TOKEN = "123e4567-e89b-42d3-a456-426614174000";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  createAdminMock.mockReturnValue(makeSupabaseClient());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/notifications/push/public-key", () => {
  it("returns 503 when the VAPID public key is not configured", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const { status, body } = await readJson(await pushKeyGet());
    expect(status).toBe(503);
    expect(body).toEqual({ error: "push_not_configured" });
  });

  it("returns the public key when configured", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BTESTKEY123";
    const res = await pushKeyGet();
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ publicKey: "BTESTKEY123" });
    expect(res.headers.get("cache-control")).toContain("max-age=300");
  });
});

describe("GET /api/v1/health", () => {
  it("returns ok with the service name", async () => {
    const { status, body } = await readJson(await healthGet());
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("servicewriter-api");
    expect(typeof body.timestamp).toBe("string");
  });
});

const TINY_CSV = [
  "record_id,year,make,model,engine,oil_type,oil_capacity,oil_filter,transmission_fluid,source,additional_specs",
  "rec-1,2022,Toyota,Camry,2.5L I4,0W-20,4.8 qt,90915-YZZF1,WS fluid,autolube_ymm_workbook,{}",
  "rec-2,2023,Honda,Accord,1.5L I4,0W-20,3.7 qt,15400-PLM-A02,,autolube_ymm_workbook,{}",
].join("\n");

describe("POST /api/v1/public-vehicle-catalog", () => {
  beforeEach(() => {
    readFileMock.mockResolvedValue(TINY_CSV);
  });

  function catalogRequest(body: unknown) {
    return catalogPost(makeRequest("/api/v1/public-vehicle-catalog", { method: "POST", body }));
  }

  it("returns 400 for an unknown action", async () => {
    const { status } = await readJson(await catalogRequest({ action: "bogus" }));
    expect(status).toBe(400);
  });

  it("returns 400 when makes is missing a valid year", async () => {
    const { status } = await readJson(await catalogRequest({ action: "makes" }));
    expect(status).toBe(400);
  });

  it("returns 400 for an out-of-range year", async () => {
    const { status } = await readJson(await catalogRequest({ action: "makes", year: 1800 }));
    expect(status).toBe(400);
  });

  it("lists years in descending order", async () => {
    const { status, body } = await readJson(await catalogRequest({ action: "years" }));
    expect(status).toBe(200);
    expect(body).toEqual({ years: [2023, 2022] });
  });

  it("lists makes for a year", async () => {
    const { status, body } = await readJson(await catalogRequest({ action: "makes", year: 2022 }));
    expect(status).toBe(200);
    expect(body).toEqual({ makes: ["Toyota"] });
  });

  it("lists models for a year and make", async () => {
    const { status, body } = await readJson(
      await catalogRequest({ action: "models", year: 2022, make: "Toyota" }),
    );
    expect(status).toBe(200);
    expect(body).toEqual({ models: ["Camry"] });
  });

  it("returns spec rows for a year/make/model", async () => {
    const { status, body } = await readJson(
      await catalogRequest({ action: "specs", year: 2022, make: "Toyota", model: "Camry" }),
    );
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ make: "Toyota", model: "Camry", oil_type: "0W-20" });
  });
});

describe("newsletter preferences", () => {
  const SUBSCRIBER = {
    id: "77777777-7777-4777-8777-777777777777",
    workspace_id: WS_ID,
    email: "sub@example.com",
    user_id: USER_ID,
  };

  it("GET returns 400 for a missing token", async () => {
    const res = await prefsGet(makeRequest("/api/v1/newsletter/preferences"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid preferences link");
  });

  it("GET returns 400 for a malformed token", async () => {
    const res = await prefsGet(makeRequest("/api/v1/newsletter/preferences?token=not-a-uuid"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid preferences link");
  });

  it("GET returns 404 when the token is unknown", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({ newsletter_subscribers: { data: null, error: null } }),
    );
    const res = await prefsGet(makeRequest(`/api/v1/newsletter/preferences?token=${PREFS_TOKEN}`));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Preferences link not found");
  });

  it("GET renders the subscribed page for an active subscriber", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({ newsletter_subscribers: { data: { status: "active" }, error: null } }),
    );
    const res = await prefsGet(makeRequest(`/api/v1/newsletter/preferences?token=${PREFS_TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("You are subscribed to weekly email updates.");
  });

  it("POST returns 400 for a malformed token", async () => {
    const res = await prefsPost(makeFormRequest("/api/v1/newsletter/preferences", { token: "nope", action: "unsubscribe" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid preferences link");
  });

  it("POST returns 404 when the token is unknown", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({ newsletter_subscribers: { data: null, error: null } }),
    );
    const res = await prefsPost(
      makeFormRequest("/api/v1/newsletter/preferences", { token: PREFS_TOKEN, action: "unsubscribe" }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Preferences link not found");
  });

  it("POST unsubscribes and renders the unsubscribed page", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({
        newsletter_subscribers: { data: SUBSCRIBER, error: null },
        messaging_consents: { data: null, error: null },
      }),
    );
    const res = await prefsPost(
      makeFormRequest("/api/v1/newsletter/preferences", { token: PREFS_TOKEN, action: "unsubscribe" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You are unsubscribed from weekly email updates.");
  });

  it("POST subscribes and renders the subscribed page", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({
        newsletter_subscribers: { data: SUBSCRIBER, error: null },
        messaging_consents: { data: null, error: null },
      }),
    );
    const res = await prefsPost(
      makeFormRequest("/api/v1/newsletter/preferences", { token: PREFS_TOKEN, action: "subscribe" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You are subscribed to weekly email updates.");
  });
});

function reviewsMemberClient(serviceRecord: Record<string, unknown>, settings: Record<string, unknown>) {
  return makeSupabaseClient({
    service_records: { data: serviceRecord, error: null },
    customers: {
      data: { id: CUSTOMER_ID, email: "cust@example.com", first_name: "Jane", last_name: "Doe" },
      error: null,
    },
    appointments: { data: { id: APPT_ID, metadata: { confirmation_code: "ABC123" } }, error: null },
    workspace_settings: { data: { operational_settings: settings }, error: null },
    workspaces: { data: { name: "Test Shop" }, error: null },
  });
}

const COMPLETED_RECORD = {
  id: SR_ID,
  workspace_id: WS_ID,
  customer_id: CUSTOMER_ID,
  appointment_id: APPT_ID,
  status: "completed",
  work_performed: "Oil change",
};
const REVIEW_SETTINGS = {
  google_review_url: "https://g.page/r/test",
  source_owner_user_id: USER_ID,
};

describe("POST /api/v1/reviews/actions", () => {
  beforeEach(() => {
    stubWorkspaceMember(api, reviewsMemberClient(COMPLETED_RECORD, REVIEW_SETTINGS));
    dispatchLifecycleMock.mockResolvedValue({
      templateKey: "review_request",
      eventId: `review:${SR_ID}`,
      recipientRole: "customer",
      status: "sent",
    });
    createAdminMock.mockReturnValue(makeSupabaseClient({ crm_activities: { data: null, error: null } }));
  });

  function reviewsRequest(body: unknown) {
    return reviewsPost(makeRequest("/api/v1/reviews/actions", { method: "POST", body }));
  }

  it("returns 401 when the caller is not a workspace member", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status, body } = await readJson(
      await reviewsRequest({ workspace_id: WS_ID, service_record_id: SR_ID }),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns 500 for an invalid body (zod parse failure)", async () => {
    const { status, body } = await readJson(await reviewsRequest({ workspace_id: "nope" }));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 409 when the service is not completed", async () => {
    stubWorkspaceMember(
      api,
      reviewsMemberClient({ ...COMPLETED_RECORD, status: "in_progress" }, REVIEW_SETTINGS),
    );
    const { status, body } = await readJson(
      await reviewsRequest({ workspace_id: WS_ID, service_record_id: SR_ID }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("service_not_completed");
  });

  it("returns 409 when no Google review URL is configured", async () => {
    stubWorkspaceMember(api, reviewsMemberClient(COMPLETED_RECORD, {}));
    const { status, body } = await readJson(
      await reviewsRequest({ workspace_id: WS_ID, service_record_id: SR_ID }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("review_url_missing");
  });

  it("dispatches a review request and logs the CRM activity", async () => {
    const { status, body } = await readJson(
      await reviewsRequest({ workspace_id: WS_ID, service_record_id: SR_ID }),
    );
    expect(status).toBe(200);
    expect(body.data).toEqual({ status: "sent", event_id: `review:${SR_ID}` });
    expect(dispatchLifecycleMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "cust@example.com", workspaceId: WS_ID }),
    );
  });
});

describe("POST /api/v1/email-testing/send", () => {
  beforeEach(() => {
    stubWorkspaceMember(api, makeSupabaseClient());
    ResendAdapterMock.mockImplementation(() => ({ send: mockResendSend }));
    mockResendSend.mockResolvedValue({
      providerName: "resend",
      status: "accepted",
      providerMessageId: "msg_1",
      acceptedAt: "2026-09-22T00:00:00.000Z",
    });
  });

  function emailTestRequest(body: unknown) {
    return emailTestPost(makeRequest("/api/v1/email-testing/send", { method: "POST", body }));
  }

  it("returns 401 when the caller is not a workspace member", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status, body } = await readJson(
      await emailTestRequest({ workspace_id: WS_ID, to: "tech@example.com" }),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns 500 for an invalid body (zod parse failure)", async () => {
    const { status, body } = await readJson(await emailTestRequest({ workspace_id: WS_ID }));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("sends a test email through the Resend adapter", async () => {
    const { status, body } = await readJson(
      await emailTestRequest({ workspace_id: WS_ID, to: "Tech@Example.com", businessName: "Test Shop" }),
    );
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      provider: "resend",
      status: "accepted",
      providerMessageId: "msg_1",
      acceptedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(ResendAdapterMock).toHaveBeenCalled();
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS_ID,
        recipient: { email: "tech@example.com" },
        purpose: "transactional",
      }),
    );
  });

  it("propagates adapter send failures as 500", async () => {
    mockResendSend.mockRejectedValue(new Error("resend down"));
    const { status, body } = await readJson(
      await emailTestRequest({ workspace_id: WS_ID, to: "tech@example.com" }),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });
});

describe("GET /api/v1/identity", () => {
  beforeEach(() => {
    stubRequireUser(
      api,
      makeSupabaseClient({
        workspace_members: {
          data: [{ workspace_id: WS_ID, role: "owner", is_active: true, workspaces: { id: WS_ID, name: "Shop" } }],
          error: null,
        },
        customer_users: { data: [], error: null },
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    stubRequireUserReject(api);
    const { status, body } = await readJson(await identityGet(makeRequest("/api/v1/identity")));
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns the user, memberships and customer links", async () => {
    const { status, body } = await readJson(await identityGet(makeRequest("/api/v1/identity")));
    expect(status).toBe(200);
    expect(body.data.user).toEqual({ id: USER_ID, email: TEST_USER.email });
    expect(body.data.memberships).toHaveLength(1);
    expect(body.data.customer_links).toEqual([]);
  });

  it("returns 500 when the membership query fails", async () => {
    stubRequireUser(
      api,
      makeSupabaseClient({
        workspace_members: { data: null, error: { message: "db down" } },
        customer_users: { data: [], error: null },
      }),
    );
    const { status, body } = await readJson(await identityGet(makeRequest("/api/v1/identity")));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });
});

describe("/api/v1/workforce-identity", () => {
  const IDENTITY_ROW = { workspace_id: WS_ID, role: "owner", display_name: "Tech" };

  function rpcClient(result: { data: unknown; error: unknown }) {
    const client = makeSupabaseClient();
    client.rpc = jest.fn().mockResolvedValue(result);
    return client;
  }

  it("GET returns 401 when unauthenticated", async () => {
    stubRequireUserReject(api);
    const { status } = await readJson(await workforceGet(makeRequest("/api/v1/workforce-identity")));
    expect(status).toBe(401);
  });

  it("GET returns the workforce identity rows", async () => {
    stubRequireUser(api, rpcClient({ data: [IDENTITY_ROW], error: null }));
    const { status, body } = await readJson(await workforceGet(makeRequest("/api/v1/workforce-identity")));
    expect(status).toBe(200);
    expect(body.data).toEqual([IDENTITY_ROW]);
  });

  it("GET returns an empty list when the rpc returns no data", async () => {
    stubRequireUser(api, rpcClient({ data: null, error: null }));
    const { status, body } = await readJson(await workforceGet(makeRequest("/api/v1/workforce-identity")));
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("GET returns 500 when the rpc fails", async () => {
    stubRequireUser(api, rpcClient({ data: null, error: { message: "db down" } }));
    const { status, body } = await readJson(await workforceGet(makeRequest("/api/v1/workforce-identity")));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST returns 400 for an invalid selection", async () => {
    stubRequireUser(api, rpcClient({ data: [IDENTITY_ROW], error: null }));
    const { status, body } = await readJson(
      await workforcePost(
        makeRequest("/api/v1/workforce-identity", {
          method: "POST",
          body: { workspaceUserId: "not-a-uuid", role: "admin" },
        }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_workspace_selection");
  });

  it("POST selects the active workspace", async () => {
    stubRequireUser(api, rpcClient({ data: [IDENTITY_ROW], error: null }));
    const { status, body } = await readJson(
      await workforcePost(
        makeRequest("/api/v1/workforce-identity", {
          method: "POST",
          body: { workspaceUserId: USER_ID, role: "owner" },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toEqual(IDENTITY_ROW);
  });

  it("POST returns 404 when the workspace is no longer available", async () => {
    stubRequireUser(api, rpcClient({ data: [], error: null }));
    const { status, body } = await readJson(
      await workforcePost(
        makeRequest("/api/v1/workforce-identity", {
          method: "POST",
          body: { workspaceUserId: USER_ID, role: "owner" },
        }),
      ),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("workspace_not_found");
  });
});

describe("GET /api/v1/workspaces", () => {
  beforeEach(() => {
    stubRequireUser(
      api,
      makeSupabaseClient({
        workspace_members: {
          data: [{ workspace_id: WS_ID, role: "owner", workspaces: { id: WS_ID, name: "Shop" } }],
          error: null,
        },
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    stubRequireUserReject(api);
    const { status } = await readJson(await workspacesGet(makeRequest("/api/v1/workspaces")));
    expect(status).toBe(401);
  });

  it("returns the workspace memberships with no-store caching", async () => {
    const res = await workspacesGet(makeRequest("/api/v1/workspaces"));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].workspace_id).toBe(WS_ID);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("GET /api/v1/command-center", () => {
  beforeEach(() => {
    stubWorkspaceMember(
      api,
      makeSupabaseClient({
        workspaces: { data: { timezone: "America/New_York" }, error: null },
        appointments: { data: [], error: null },
        work_orders: { data: [], error: null },
        workspace_members: { data: [], error: null },
      }),
    );
  });

  function commandCenterRequest(query: string) {
    return commandCenterGet(makeRequest(`/api/v1/command-center${query}`));
  }

  it("rejects when the caller is not a workspace member", async () => {
    stubWorkspaceMemberReject(api, 401);
    await expect(
      commandCenterRequest(`?workspace_id=${WS_ID}&date=2026-09-22`),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects invalid query params", async () => {
    await expect(commandCenterRequest(`?workspace_id=${WS_ID}`)).rejects.toThrow();
  });

  it("returns the day board for the workspace", async () => {
    const { status, body } = await readJson(
      await commandCenterRequest(`?workspace_id=${WS_ID}&date=2026-09-22`),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      timezone: "America/New_York",
      appointments: [],
      work_orders: [],
      members: [],
      technicians: [],
    });
  });
});

describe("GET /api/v1/service-catalog", () => {
  beforeEach(() => {
    stubWorkspaceMember(
      api,
      makeSupabaseClient({
        service_catalog: { data: [{ id: "svc-1", name: "Oil Change", is_active: true }], error: null },
      }),
    );
  });

  it("returns 400 when workspace_id is missing", async () => {
    const { status, body } = await readJson(await serviceCatalogGet(makeRequest("/api/v1/service-catalog")));
    expect(status).toBe(400);
    expect(body.error.code).toBe("missing_workspace");
  });

  it("returns 401 when the caller is not a workspace member", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await serviceCatalogGet(makeRequest(`/api/v1/service-catalog?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("returns the active service catalog entries", async () => {
    const { status, body } = await readJson(
      await serviceCatalogGet(makeRequest(`/api/v1/service-catalog?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toEqual([{ id: "svc-1", name: "Oil Change", is_active: true }]);
  });
});
