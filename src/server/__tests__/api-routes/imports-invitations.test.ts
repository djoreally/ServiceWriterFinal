import "../../../test/api-routes/env";

import { z as mockZ } from "zod";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/accountImport", () => ({
  accountExportSchema: mockZ.unknown(),
  createImportBatch: jest.fn(),
  executeImportBatch: jest.fn(),
  rollbackImportBatch: jest.fn(),
}));
jest.mock("@/server/invitations/mailer", () => ({
  sendInvitationEmail: jest.fn(),
}));
jest.mock("@/server/audit", () => ({
  recordOperationalAudit: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));

import { createHash } from "node:crypto";
import * as api from "@/server/api";
import {
  createImportBatch,
  executeImportBatch,
  rollbackImportBatch,
} from "@/server/accountImport";
import { sendInvitationEmail } from "@/server/invitations/mailer";
import { recordOperationalAudit } from "@/server/audit";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { GET as importsGet, POST as importsPost } from "../../../../app/api/v1/imports/route";
import { GET as importGet, POST as importPost } from "../../../../app/api/v1/imports/[id]/route";
import { GET as invitationsGet, POST as invitationsPost } from "../../../../app/api/v1/invitations/route";
import {
  DELETE as invitationDelete,
  GET as invitationGet,
  POST as invitationPost,
} from "../../../../app/api/v1/invitations/[id]/route";
import { POST as invitationResendPost } from "../../../../app/api/v1/invitations/[id]/resend/route";
import { GET as invitationResolveGet } from "../../../../app/api/v1/invitations/resolve/route";
import {
  WS_ID,
  USER_ID,
  TEST_USER,
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  stubRequireUser,
  stubRequireUserReject,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const { ApiError } = jest.requireActual("@/server/api") as typeof import("@/server/api");

const BATCH_ID = "88888888-8888-4888-8888-888888888888";
const INVITATION_ID = "99999999-9999-4999-8999-999999999999";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("imports (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      account_import_batches: {
        data: [{ id: BATCH_ID, workspace_id: WS_ID, status: "staged" }],
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    (createImportBatch as jest.Mock).mockResolvedValue({
      batch: { id: BATCH_ID, status: "staged" },
      exportData: { exportVersion: "v1", data: { customers: [{ id: "c1" }, { id: "c2" }] } },
    });
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await importsGet(makeRequest(`/api/v1/imports?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  // Grey-box note: these routes have no ZodError mapping, so schema validation
  // failures surface as 500 internal_error via errorResponse (only 3 of the
  // 60 v1 routes map ZodError to 400 explicitly).
  it("GET returns 500 when workspace_id is missing (no ZodError mapping)", async () => {
    const { status, body } = await readJson(await importsGet(makeRequest("/api/v1/imports")));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("GET returns the batch list", async () => {
    const { status, body } = await readJson(
      await importsGet(makeRequest(`/api/v1/imports?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ limit: 25, offset: 0, total: 0 });
  });

  it("POST returns 500 for an invalid body (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await importsPost(
        makeRequest("/api/v1/imports", { method: "POST", body: { workspace_id: WS_ID } }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(createImportBatch).not.toHaveBeenCalled();
  });

  it("POST stages a batch and returns 201 with a preview", async () => {
    const { status, body } = await readJson(
      await importsPost(
        makeRequest("/api/v1/imports", {
          method: "POST",
          body: { workspace_id: WS_ID, file_name: "export.json", export: { customers: [] } },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ id: BATCH_ID });
    expect(body.preview).toMatchObject({ source_version: "v1", sections: { customers: 2 } });
    expect(createImportBatch).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_ID, fileName: "export.json" }),
    );
  });
});

describe("imports/[id] (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      account_import_batches: {
        data: { id: BATCH_ID, status: "staged", source_sha256: "sha", workspace_id: WS_ID },
        error: null,
      },
      account_import_records: { data: [{ id: "rec-1", status: "pending" }], error: null },
    });
    stubWorkspaceMember(api, supabase);
    (executeImportBatch as jest.Mock).mockResolvedValue({ imported: 3, skipped: 0 });
    (rollbackImportBatch as jest.Mock).mockResolvedValue({ rolled_back: 3 });
  });

  const ctx = contextWithParams({ id: BATCH_ID });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await importGet(makeRequest(`/api/v1/imports/${BATCH_ID}?workspace_id=${WS_ID}`), ctx),
    );
    expect(status).toBe(401);
  });

  it("GET returns the batch with its records", async () => {
    const { status, body } = await readJson(
      await importGet(makeRequest(`/api/v1/imports/${BATCH_ID}?workspace_id=${WS_ID}`), ctx),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(BATCH_ID);
    expect(body.records).toHaveLength(1);
  });

  it("POST rollback rolls the batch back", async () => {
    const { status, body } = await readJson(
      await importPost(
        makeRequest(`/api/v1/imports/${BATCH_ID}`, {
          method: "POST",
          body: { workspace_id: WS_ID, action: "rollback" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ rolled_back: 3 });
    expect(rollbackImportBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: BATCH_ID, workspaceId: WS_ID }),
    );
  });

  it("POST execute returns 400 when the export payload is missing", async () => {
    const { status, body } = await readJson(
      await importPost(
        makeRequest(`/api/v1/imports/${BATCH_ID}`, {
          method: "POST",
          body: { workspace_id: WS_ID, action: "execute" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("missing_export");
  });

  it("POST execute returns 409 when the export does not match the staged batch", async () => {
    const { status, body } = await readJson(
      await importPost(
        makeRequest(`/api/v1/imports/${BATCH_ID}`, {
          method: "POST",
          body: { workspace_id: WS_ID, action: "execute", export: { customers: [{ id: "other" }] } },
        }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("source_mismatch");
    expect(executeImportBatch).not.toHaveBeenCalled();
  });

  it("POST execute runs the batch when the hash matches", async () => {
    const exportPayload = { customers: [{ id: "c1" }] };
    const hash = createHash("sha256").update(JSON.stringify(exportPayload)).digest("hex");
    supabase = makeSupabaseClient({
      account_import_batches: {
        data: { id: BATCH_ID, status: "staged", source_sha256: hash, workspace_id: WS_ID },
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await importPost(
        makeRequest(`/api/v1/imports/${BATCH_ID}`, {
          method: "POST",
          body: { workspace_id: WS_ID, action: "execute", export: exportPayload },
        }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ imported: 3 });
    expect(executeImportBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: BATCH_ID }),
      exportPayload,
    );
  });

  it("POST execute returns 409 for a non-executable batch state", async () => {
    const exportPayload = { customers: [] };
    const hash = createHash("sha256").update(JSON.stringify(exportPayload)).digest("hex");
    supabase = makeSupabaseClient({
      account_import_batches: {
        data: { id: BATCH_ID, status: "completed", source_sha256: hash, workspace_id: WS_ID },
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await importPost(
        makeRequest(`/api/v1/imports/${BATCH_ID}`, {
          method: "POST",
          body: { workspace_id: WS_ID, action: "execute", export: exportPayload },
        }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invalid_batch_state");
  });
});

describe("invitations (GET/POST)", () => {
  let supabase: MockSupabaseClient;
  let admin: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      invitation_delivery_attempts: { data: [], error: null },
      invitations: {
        data: {
          id: INVITATION_ID,
          workspace_id: WS_ID,
          invited_email: "new@example.com",
          invited_role: "technician",
          expires_at: FUTURE,
        },
        error: null,
      },
      invitation_events: { data: null, error: null },
    });
    admin = makeSupabaseClient({ invitation_delivery_attempts: { data: null, error: null } });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
    (sendInvitationEmail as jest.Mock).mockResolvedValue({
      providerName: "resend",
      providerMessageId: "msg_1",
    });
    (recordOperationalAudit as jest.Mock).mockResolvedValue({ ok: true });
  });

  it("GET returns 400 when workspace_id is missing", async () => {
    const { status, body } = await readJson(await invitationsGet(makeRequest("/api/v1/invitations")));
    expect(status).toBe(400);
    expect(body.error.code).toBe("missing_workspace");
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await invitationsGet(makeRequest(`/api/v1/invitations?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("GET returns the invitation list", async () => {
    const { status, body } = await readJson(
      await invitationsGet(makeRequest(`/api/v1/invitations?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.pagination).toMatchObject({ limit: 25, offset: 0 });
  });

  it("POST returns 500 for an invalid email (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "not-an-email", invited_role: "technician" },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("POST returns 400 when customer_id is missing for a customer invitation", async () => {
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "cust@example.com", invited_role: "customer" },
        }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("customer_required");
  });

  it("POST returns 409 when an active invitation already exists", async () => {
    supabase = makeSupabaseClient({
      invitation_delivery_attempts: { data: [], error: null },
      invitations: { data: [{ id: "existing" }], error: null },
    });
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "dup@example.com", invited_role: "technician" },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invitation_pending");
  });

  it("POST returns 429 when the send rate limit is exceeded", async () => {
    supabase = makeSupabaseClient({
      invitation_delivery_attempts: {
        data: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, created_at: new Date().toISOString() })),
        error: null,
      },
    });
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "spam@example.com", invited_role: "technician" },
        }),
      ),
    );
    expect(status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });

  it("POST creates the invitation, sends the email and returns 201", async () => {
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "new@example.com", invited_role: "technician" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(INVITATION_ID);
    expect(body.delivery).toMatchObject({ status: "accepted", provider: "resend" });
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: INVITATION_ID, recipientEmail: "new@example.com" }),
    );
    expect(recordOperationalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "invitation.created", entityId: INVITATION_ID }),
    );
  });

  it("POST still returns 201 when email delivery fails, with a failed delivery status", async () => {
    (sendInvitationEmail as jest.Mock).mockRejectedValue(new Error("SMTP down"));
    const { status, body } = await readJson(
      await invitationsPost(
        makeRequest("/api/v1/invitations", {
          method: "POST",
          body: { workspace_id: WS_ID, invited_email: "new@example.com", invited_role: "technician" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.delivery).toMatchObject({ status: "failed", provider: "supabase_auth" });
  });
});

describe("invitations/[id] (GET preview/DELETE revoke/POST accept)", () => {
  let admin: MockSupabaseClient;
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: INVITATION_ID });
  const token = "a".repeat(40);

  beforeEach(() => {
    admin = makeSupabaseClient({
      invitations: {
        data: {
          id: INVITATION_ID,
          workspace_id: WS_ID,
          invited_email: "new@example.com",
          invited_role: "technician",
          expires_at: FUTURE,
          accepted_at: null,
          revoked_at: null,
        },
        error: null,
      },
      workspaces: { data: { name: "MOMS" }, error: null },
    });
    supabase = makeSupabaseClient();
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    stubRequireUser(api, supabase);
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
      supabase,
      user: TEST_USER,
      membership: { role: "owner" },
    });
  });

  it("GET preview returns 404 for an unknown invitation", async () => {
    admin = makeSupabaseClient({ invitations: { data: null, error: null } });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationGet(makeRequest(`/api/v1/invitations/${INVITATION_ID}?token=${token}`), ctx),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("invalid_invitation");
  });

  it("GET preview returns 404 when the token is too short", async () => {
    const { status } = await readJson(
      await invitationGet(makeRequest(`/api/v1/invitations/${INVITATION_ID}?token=short`), ctx),
    );
    expect(status).toBe(404);
  });

  it("GET preview returns 410 for an expired invitation", async () => {
    admin = makeSupabaseClient({
      invitations: {
        data: { id: INVITATION_ID, workspace_id: WS_ID, invited_email: "e@x.com", invited_role: "tech", expires_at: PAST, accepted_at: null, revoked_at: null },
        error: null,
      },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationGet(makeRequest(`/api/v1/invitations/${INVITATION_ID}?token=${token}`), ctx),
    );
    expect(status).toBe(410);
    expect(body.error.code).toBe("invitation_expired");
  });

  it("GET preview returns the invitation summary for a valid token", async () => {
    const { status, body } = await readJson(
      await invitationGet(makeRequest(`/api/v1/invitations/${INVITATION_ID}?token=${token}`), ctx),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      id: INVITATION_ID,
      invited_email: "new@example.com",
      invited_role: "technician",
      workspace_name: "MOMS",
    });
  });

  it("DELETE returns 401 when unauthenticated", async () => {
    stubRequireUserReject(api);
    const { status } = await readJson(
      await invitationDelete(makeRequest(`/api/v1/invitations/${INVITATION_ID}`, { method: "DELETE" }), ctx),
    );
    expect(status).toBe(401);
  });

  it("DELETE revokes the invitation through the RPC", async () => {
    admin.rpc.mockResolvedValue({ data: { revoked: true }, error: null });
    const { status, body } = await readJson(
      await invitationDelete(makeRequest(`/api/v1/invitations/${INVITATION_ID}`, { method: "DELETE" }), ctx),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ revoked: true });
    expect(admin.rpc).toHaveBeenCalledWith(
      "revoke_invitation_v1",
      expect.objectContaining({ p_invitation_id: INVITATION_ID, p_actor_user_id: USER_ID }),
    );
  });

  it("POST accept returns 500 for a short token (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await invitationPost(
        makeRequest(`/api/v1/invitations/${INVITATION_ID}`, { method: "POST", body: { token: "short" } }),
        ctx,
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST accept accepts the invitation via RPC", async () => {
    supabase.rpc.mockResolvedValue({ data: { membership_id: "m-1" }, error: null });
    const { status, body } = await readJson(
      await invitationPost(
        makeRequest(`/api/v1/invitations/${INVITATION_ID}`, { method: "POST", body: { token } }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ membership_id: "m-1" });
  });

  it("POST accept maps an already-accepted error to 409", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "Invitation has already been accepted" } });
    const { status, body } = await readJson(
      await invitationPost(
        makeRequest(`/api/v1/invitations/${INVITATION_ID}`, { method: "POST", body: { token } }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invitation_used");
  });
});

describe("invitations/[id]/resend (POST)", () => {
  let admin: MockSupabaseClient;
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: INVITATION_ID });

  const invitationRow = {
    id: INVITATION_ID,
    workspace_id: WS_ID,
    customer_id: null,
    invited_email: "new@example.com",
    invited_role: "technician",
    expires_at: FUTURE,
    accepted_at: null,
    revoked_at: null,
  };

  beforeEach(() => {
    admin = makeSupabaseClient({
      invitations: { data: invitationRow, error: null },
      invitation_delivery_attempts: { data: [], error: null },
    });
    supabase = makeSupabaseClient({
      invitations: { data: invitationRow, error: null },
      invitation_events: { data: null, error: null },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    stubWorkspaceMember(api, supabase);
    (sendInvitationEmail as jest.Mock).mockResolvedValue({
      providerName: "resend",
      providerMessageId: "msg_2",
    });
  });

  it("returns 404 for an unknown invitation", async () => {
    admin = makeSupabaseClient({ invitations: { data: null, error: { code: "PGRST116" } } });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationResendPost(makeRequest(`/api/v1/invitations/${INVITATION_ID}/resend`, { method: "POST" }), ctx),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await invitationResendPost(makeRequest(`/api/v1/invitations/${INVITATION_ID}/resend`, { method: "POST" }), ctx),
    );
    expect(status).toBe(401);
  });

  it("returns 409 for an already-accepted invitation", async () => {
    admin = makeSupabaseClient({
      invitations: { data: { ...invitationRow, accepted_at: new Date().toISOString() }, error: null },
      invitation_delivery_attempts: { data: [], error: null },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationResendPost(makeRequest(`/api/v1/invitations/${INVITATION_ID}/resend`, { method: "POST" }), ctx),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invitation_used");
  });

  it("resends the invitation email and returns 200", async () => {
    const { status, body } = await readJson(
      await invitationResendPost(makeRequest(`/api/v1/invitations/${INVITATION_ID}/resend`, { method: "POST" }), ctx),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(INVITATION_ID);
    expect(body.delivery).toMatchObject({ status: "accepted", provider: "resend" });
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: INVITATION_ID, recipientEmail: "new@example.com" }),
    );
  });

  it("returns 502 when resend delivery fails", async () => {
    (sendInvitationEmail as jest.Mock).mockRejectedValue(new Error("SMTP down"));
    const { status, body } = await readJson(
      await invitationResendPost(makeRequest(`/api/v1/invitations/${INVITATION_ID}/resend`, { method: "POST" }), ctx),
    );
    expect(status).toBe(502);
    expect(body.delivery).toMatchObject({ status: "failed" });
  });
});

describe("invitations/resolve (GET)", () => {
  let admin: MockSupabaseClient;
  const token = "b".repeat(40);

  beforeEach(() => {
    admin = makeSupabaseClient();
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
  });

  it("returns 500 when the token is missing", async () => {
    const { status } = await readJson(await invitationResolveGet(makeRequest("/api/v1/invitations/resolve")));
    expect(status).toBe(500);
  });

  it("returns 404 for an unknown token", async () => {
    admin = makeSupabaseClient({ invitations: { data: null, error: null } });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationResolveGet(makeRequest(`/api/v1/invitations/resolve?token=${token}`)),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("invalid_invitation");
  });

  it("returns 410 for an expired invitation", async () => {
    admin = makeSupabaseClient({
      invitations: { data: { id: INVITATION_ID, expires_at: PAST, accepted_at: null, revoked_at: null }, error: null },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationResolveGet(makeRequest(`/api/v1/invitations/resolve?token=${token}`)),
    );
    expect(status).toBe(410);
    expect(body.error.code).toBe("invitation_expired");
  });

  it("resolves a valid token without authentication", async () => {
    admin = makeSupabaseClient({
      invitations: { data: { id: INVITATION_ID, expires_at: FUTURE, accepted_at: null, revoked_at: null }, error: null },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status, body } = await readJson(
      await invitationResolveGet(makeRequest(`/api/v1/invitations/resolve?token=${token}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ invitation_id: INVITATION_ID });
    expect(api.requireUser).not.toHaveBeenCalled();
    expect(api.requireWorkspaceMember).not.toHaveBeenCalled();
  });
});
