import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/messaging/appointment-events", () => ({
  dispatchAppointmentLifecycle: jest.fn(),
}));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  LIFECYCLE_EVENT_KEYS: {
    technicianEnRoute: "technician.en_route",
    technicianArrived: "technician.arrived",
    serviceStarted: "service.started",
    serviceCompleted: "service.completed",
    appointmentCancelled: "appointment.cancelled",
    technicianAssigned: "technician.assigned",
    jobAssigned: "job.assigned",
    assignmentChanged: "assignment.changed",
  },
}));
jest.mock("@/server/messaging/lifecycle-action-urls", () => ({
  technicianJobUrl: jest.fn(() => "https://test.local/tech-job"),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));

import * as api from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { GET as crmAccessGet } from "../../../../app/api/v1/crm/access/route";
import { GET as activitiesGet, POST as activitiesPost } from "../../../../app/api/v1/crm/activities/route";
import { GET as campaignsGet, POST as campaignsPost } from "../../../../app/api/v1/crm/campaigns/route";
import { GET as profilesGet, PATCH as profilesPatch, POST as profilesPost } from "../../../../app/api/v1/crm/profiles/route";
import { GET as dispatchEventsGet, POST as dispatchEventsPost } from "../../../../app/api/v1/dispatch-events/route";
import { POST as dispatchAssignPost } from "../../../../app/api/v1/dispatch/assign/route";
import {
  WS_ID,
  APPOINTMENT_ID,
  TEST_USER,
  makeRequest,
  readJson,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const { ApiError } = jest.requireActual("@/server/api") as typeof import("@/server/api");

const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const PROFILE_ID = "88888888-8888-4888-8888-888888888888";
const TECH_ID = "77777777-7777-4777-8777-777777777777";

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  (dispatchAppointmentLifecycle as jest.Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

function stubCrmCapability(supabase: MockSupabaseClient, user = TEST_USER) {
  (api.requireCrmCapability as jest.Mock).mockResolvedValue({ supabase, user });
}

function stubCrmCapabilityReject(status = 401, code = "unauthenticated") {
  (api.requireCrmCapability as jest.Mock).mockRejectedValue(new ApiError(status, "Denied", code));
}

describe("crm/access (GET)", () => {
  beforeEach(() => {
    stubCrmCapability(makeSupabaseClient());
  });

  it("returns 400 for a malformed workspace_id", async () => {
    const { status, body } = await readJson(await crmAccessGet(makeRequest("/api/v1/crm/access?workspace_id=nope")));
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_workspace");
  });

  it("returns 403 when the CRM capability is denied", async () => {
    stubCrmCapabilityReject(403, "crm_forbidden");
    const { status, body } = await readJson(
      await crmAccessGet(makeRequest(`/api/v1/crm/access?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("crm_forbidden");
  });

  it("returns 401 when unauthenticated", async () => {
    stubCrmCapabilityReject(401);
    const { status } = await readJson(
      await crmAccessGet(makeRequest(`/api/v1/crm/access?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("returns can_view for an authorized workspace", async () => {
    const { status, body } = await readJson(
      await crmAccessGet(makeRequest(`/api/v1/crm/access?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ workspace_id: WS_ID, can_view: true });
    expect(api.requireCrmCapability).toHaveBeenCalledWith(expect.anything(), WS_ID, "crm.view");
  });
});

describe("crm/activities (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      crm_activities: {
        data: [{ id: "act-1", workspace_id: WS_ID, activity_type: "note", summary: "Called customer" }],
        error: null,
      },
    });
    stubCrmCapability(supabase);
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubCrmCapabilityReject(401);
    const { status } = await readJson(
      await activitiesGet(makeRequest(`/api/v1/crm/activities?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("GET returns the activity list with totals", async () => {
    const { status, body } = await readJson(
      await activitiesGet(makeRequest(`/api/v1/crm/activities?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].activity_type).toBe("note");
    expect(body.meta).toMatchObject({ limit: 25, offset: 0, total: 0 });
  });

  it("POST returns 403 when the write capability is denied", async () => {
    stubCrmCapabilityReject(403, "crm_forbidden");
    const { status, body } = await readJson(
      await activitiesPost(
        makeRequest("/api/v1/crm/activities", {
          method: "POST",
          body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, activity_type: "note", summary: "hi" },
        }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("crm_forbidden");
  });

  // Grey-box note: these routes have no ZodError mapping, so schema validation
  // failures surface as 500 internal_error via errorResponse (only 3 of the
  // 60 v1 routes map ZodError to 400 explicitly).
  it("POST returns 500 for an invalid activity body (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await activitiesPost(
        makeRequest("/api/v1/crm/activities", {
          method: "POST",
          body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, activity_type: "smoke_signal" },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST creates the activity and returns 201", async () => {
    const { status, body } = await readJson(
      await activitiesPost(
        makeRequest("/api/v1/crm/activities", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            customer_id: CUSTOMER_ID,
            activity_type: "call",
            summary: "Confirmed arrival window",
          },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data[0].id).toBe("act-1");
    expect(supabase.from).toHaveBeenCalledWith("crm_activities");
  });
});

describe("crm/campaigns (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      crm_campaigns: {
        data: [{ id: "camp-1", workspace_id: WS_ID, name: "Spring reminders", purpose: "marketing", channel: "email" }],
        error: null,
      },
    });
    stubCrmCapability(supabase);
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubCrmCapabilityReject(401);
    const { status } = await readJson(
      await campaignsGet(makeRequest(`/api/v1/crm/campaigns?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("GET returns the campaign list", async () => {
    const { status, body } = await readJson(
      await campaignsGet(makeRequest(`/api/v1/crm/campaigns?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Spring reminders");
  });

  it("POST returns 500 for a missing name (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await campaignsPost(
        makeRequest("/api/v1/crm/campaigns", {
          method: "POST",
          body: { workspace_id: WS_ID, purpose: "marketing", channel: "email" },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST drafts a campaign and returns 201", async () => {
    const { status, body } = await readJson(
      await campaignsPost(
        makeRequest("/api/v1/crm/campaigns", {
          method: "POST",
          body: { workspace_id: WS_ID, name: "Win-back", purpose: "win_back", channel: "sms" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data[0].id).toBe("camp-1");
  });
});

describe("crm/profiles (GET/POST/PATCH)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      crm_profiles: {
        data: [{ id: PROFILE_ID, workspace_id: WS_ID, customer_id: CUSTOMER_ID, lifecycle_stage: "new" }],
        error: null,
      },
    });
    stubCrmCapability(supabase);
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubCrmCapabilityReject(401);
    const { status } = await readJson(
      await profilesGet(makeRequest(`/api/v1/crm/profiles?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("GET returns the profile list", async () => {
    const { status, body } = await readJson(
      await profilesGet(makeRequest(`/api/v1/crm/profiles?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ limit: 25, offset: 0 });
  });

  it("POST returns 500 for a missing customer_id (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await profilesPost(
        makeRequest("/api/v1/crm/profiles", { method: "POST", body: { workspace_id: WS_ID } }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST creates a profile and returns 201", async () => {
    const { status, body } = await readJson(
      await profilesPost(
        makeRequest("/api/v1/crm/profiles", {
          method: "POST",
          body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, lifecycle_stage: "qualified" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data[0].id).toBe(PROFILE_ID);
  });

  it("PATCH returns 500 when id or workspace_id is missing (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await profilesPatch(
        makeRequest("/api/v1/crm/profiles", {
          method: "PATCH",
          body: { workspace_id: WS_ID, lifecycle_stage: "booked" },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("PATCH updates the profile and returns 200", async () => {
    const { status, body } = await readJson(
      await profilesPatch(
        makeRequest("/api/v1/crm/profiles", {
          method: "PATCH",
          body: { id: PROFILE_ID, workspace_id: WS_ID, lifecycle_stage: "booked" },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data[0].id).toBe(PROFILE_ID);
  });
});

describe("dispatch-events (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      dispatch_events: { data: [{ id: "evt-1", event_type: "note" }], error: null },
    });
    stubWorkspaceMember(api, supabase);
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(makeSupabaseClient());
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status, body } = await readJson(
      await dispatchEventsGet(makeRequest(`/api/v1/dispatch-events?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("GET returns 500 when workspace_id is missing", async () => {
    const { status } = await readJson(await dispatchEventsGet(makeRequest("/api/v1/dispatch-events")));
    expect(status).toBe(500);
  });

  it("GET returns the event list with pagination", async () => {
    const { status, body } = await readJson(
      await dispatchEventsGet(makeRequest(`/api/v1/dispatch-events?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ limit: 25, offset: 0 });
  });

  it("POST returns 500 when neither appointment_id nor work_order_id is given (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await dispatchEventsPost(
        makeRequest("/api/v1/dispatch-events", {
          method: "POST",
          body: { workspace_id: WS_ID, event_type: "note" },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST returns 403 when a technician records an event for someone else", async () => {
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "technician" },
    });
    const { status, body } = await readJson(
      await dispatchEventsPost(
        makeRequest("/api/v1/dispatch-events", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            appointment_id: APPOINTMENT_ID,
            technician_id: TECH_ID,
            event_type: "note",
          },
        }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("POST records a dispatch event and returns 201", async () => {
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
    const { status, body } = await readJson(
      await dispatchEventsPost(
        makeRequest("/api/v1/dispatch-events", {
          method: "POST",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, event_type: "note", notes: "On the way" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data).toHaveLength(1);
  });

  it("POST dispatches a lifecycle email for an en_route event", async () => {
    supabase = makeSupabaseClient({
      dispatch_events: { data: { id: "evt-2", event_type: "en_route" }, error: null },
      appointments: {
        data: { id: APPOINTMENT_ID, customers: { email: "cust@example.com" } },
        error: null,
      },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
    const admin = makeSupabaseClient();
    (admin.auth as unknown as Record<string, unknown>).admin = {
      getUserById: jest.fn().mockResolvedValue({
        data: { user: { email: "tech@example.com", user_metadata: { full_name: "Tech One" } } },
        error: null,
      }),
    };
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    const { status } = await readJson(
      await dispatchEventsPost(
        makeRequest("/api/v1/dispatch-events", {
          method: "POST",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, event_type: "en_route" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "technician.en_route" }),
    );
  });
});

describe("dispatch/assign (POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      appointments: { data: { assigned_user_id: null }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    supabase.rpc.mockResolvedValue({ data: { assignment_id: "asg-1" }, error: null });
    stubWorkspaceMember(api, supabase);
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(makeSupabaseClient());
  });

  const body = { workspace_id: WS_ID, job_source: "appointment", job_id: APPOINTMENT_ID, notes: "Handle with care" };

  it("returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status, body: resBody } = await readJson(
      await dispatchAssignPost(makeRequest("/api/v1/dispatch/assign", { method: "POST", body })),
    );
    expect(status).toBe(401);
    expect(resBody.error.code).toBe("unauthenticated");
  });

  it("returns 500 for an invalid job_source (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await dispatchAssignPost(
        makeRequest("/api/v1/dispatch/assign", {
          method: "POST",
          body: { workspace_id: WS_ID, job_source: "teleport", job_id: APPOINTMENT_ID },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("assigns the job through the RPC and returns 200", async () => {
    const { status, body: resBody } = await readJson(
      await dispatchAssignPost(makeRequest("/api/v1/dispatch/assign", { method: "POST", body })),
    );
    expect(status).toBe(200);
    expect(resBody.data).toMatchObject({ assignment_id: "asg-1" });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "assign_dispatch_job_v1",
      expect.objectContaining({
        p_workspace_id: WS_ID,
        p_job_source: "appointment",
        p_job_id: APPOINTMENT_ID,
        p_technician_id: null,
      }),
    );
  });

  it("notifies the newly assigned technician", async () => {
    supabase = makeSupabaseClient({
      appointments: { data: { id: APPOINTMENT_ID, customers: { email: "cust@example.com" } }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    supabase.rpc.mockResolvedValue({ data: { assignment_id: "asg-2" }, error: null });
    stubWorkspaceMember(api, supabase);
    const admin = makeSupabaseClient();
    (admin.auth as unknown as Record<string, unknown>).admin = {
      getUserById: jest.fn().mockResolvedValue({
        data: { user: { email: "tech@example.com", user_metadata: { full_name: "Tech One" } } },
        error: null,
      }),
    };
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    const { status } = await readJson(
      await dispatchAssignPost(
        makeRequest("/api/v1/dispatch/assign", {
          method: "POST",
          body: { ...body, technician_id: TECH_ID },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "technician.assigned" }),
    );
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "job.assigned", recipientEmail: "tech@example.com" }),
    );
  });
});
