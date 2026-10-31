/**
 * Grey-box tests for the platform Hono router (health, identity, workspaces,
 * invitations, imports, public booking).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  accountImportFactory as mockAccountImportFactory,
  auditFactory as mockAuditFactory,
  bookingConfirmationFactory as mockBookingConfirmationFactory,
  invitationsMailerFactory as mockInvitationsMailerFactory,
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
jest.mock("@/server/invitations/mailer", () =>
  mockInvitationsMailerFactory(),
);
jest.mock("@/server/audit", () =>
  mockAuditFactory(),
);
jest.mock("@/server/accountImport", () =>
  mockAccountImportFactory(),
);
jest.mock("@/server/messaging/booking-confirmation", () =>
  mockBookingConfirmationFactory(),
);

import { platformRouter as platformRouterRaw } from "@/server/hono/routes/platform";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const platformRouter = testRouter(platformRouterRaw);

beforeEach(() => {
  resetHarness();
});

describe("platform router", () => {
  describe("GET /v1/health", () => {
    it("answers without authentication", async () => {
      authState.mode = "unauthorized";
      const res = await platformRouter.request("/v1/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.service).toBe("servicewriter-api");
    });
  });

  describe("GET /v1/identity", () => {
    it("returns the user with memberships and customer links", async () => {
      db.workspace_members = {
        data: [{ workspace_id: WS_ID, role: "owner", is_active: true }],
        error: null,
      };
      db.customer_users = { data: [], error: null };
      const res = await platformRouter.request("/v1/identity");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.user.id).toBe(USER_ID);
      expect(body.data.memberships).toHaveLength(1);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await platformRouter.request("/v1/identity");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/workspaces", () => {
    it("lists the caller's workspaces with no-store caching", async () => {
      db.workspace_members = {
        data: [{ workspace_id: WS_ID, role: "owner" }],
        error: null,
      };
      const res = await platformRouter.request("/v1/workspaces");
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect((await res.json()).data).toHaveLength(1);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await platformRouter.request("/v1/workspaces");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/invitations", () => {
    const body = {
      workspace_id: WS_ID,
      invited_email: "newhire@example.com",
      invited_role: "manager",
    };

    function seedHappyPath() {
      db.invitation_delivery_attempts = { data: [], error: null };
      db.invitations = { data: [], error: null };
      db["invitations:single"] = {
        data: {
          id: "inv-1",
          workspace_id: WS_ID,
          invited_email: "newhire@example.com",
          invited_role: "manager",
          expires_at: new Date().toISOString(),
        },
        error: null,
      };
    }

    it("creates an invitation and returns 201", async () => {
      seedHappyPath();
      const res = await platformRouter.request("/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      const payload = await res.json();
      expect(payload.data.id).toBe("inv-1");
      expect(payload.delivery).toBeDefined();
      expect(calls.inserts.some((i) => i.table === "invitations")).toBe(true);
    });

    it("returns 409 when an active invitation already exists", async () => {
      db.invitation_delivery_attempts = { data: [], error: null };
      db.invitations = { data: [{ id: "inv-old" }], error: null };
      const res = await platformRouter.request("/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("invitation_pending");
    });

    it("restricts inviting to owner/admin", async () => {
      authState.role = "technician";
      const res = await platformRouter.request("/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    });

    it("rejects an invalid email", async () => {
      const res = await platformRouter.request("/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, invited_email: "nope" }),
      });
      // zod email violation -> ZodError -> 400 invalid_input via
      // errorResponse (validation failures are a 400, never a 500).
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
    });
  });

  describe("public booking", () => {
    it("rejects a malformed slug with a 400 contract", async () => {
      const res = await platformRouter.request(
        "/v1/public-booking/Bad_Slug!!",
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(
        "invalid_public_booking_request",
      );
    });
  });

  describe("GET /v1/platform/dashboard/cockpit-rows (B2/T-1)", () => {
    it("composes display_title + confirmation_code on the cockpit's appointment rows", async () => {
      db.workspace_members = {
        data: [
          { workspace_id: WS_ID, role: "owner", is_active: true, workspaces: { id: WS_ID, is_active: true } },
        ],
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "America/New_York" }, error: null };
      db.appointments = {
        data: [
          {
            id: "990e8400-e29b-41d4-a716-446655440001",
            status: "confirmed",
            starts_at: "2026-10-30T14:00:00.000Z",
            confirmation_code: "78361AF6",
            customers: { first_name: "Laurie", last_name: "Buckman" },
            metadata: { title: "COCKPIT PRIVATE TITLE" },
          },
        ],
        error: null,
      };
      db.service_records = { data: [], error: null };
      db.invoices = { data: [], error: null };
      db.appointment_items = {
        data: [
          { appointment_id: "990e8400-e29b-41d4-a716-446655440001", description: "Full Synthetic Oil Change", sort_order: 0 },
        ],
        error: null,
      };
      const bounds = new URLSearchParams({
        today_start: "2026-10-30T04:00:00.000Z",
        today_end: "2026-10-31T04:00:00.000Z",
        yesterday_start: "2026-10-29T04:00:00.000Z",
        yesterday_end: "2026-10-30T04:00:00.000Z",
        week_start: "2026-10-26T04:00:00.000Z",
        month_start: "2026-10-01T04:00:00.000Z",
        year_start: "2026-01-01T05:00:00.000Z",
        next7_end: "2026-11-07T05:00:00.000Z",
        prev_month_start: "2026-09-01T04:00:00.000Z",
        prev_month_mtd_end: "2026-09-30T04:00:00.000Z",
      });
      const res = await platformRouter.request(
        `/v1/platform/dashboard/cockpit-rows?${bounds.toString()}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.todayApptRows[0].display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
      expect(body.todayApptRows[0].primary_service_name).toBe("Full Synthetic Oil Change");
      expect(body.todayApptRows[0].confirmation_code).toBe("78361AF6");
      expect(body.todayApptRows[0].display_title).not.toContain("COCKPIT PRIVATE TITLE");
    });
  });

  describe("route registration", () => {
    it("exposes the audit log endpoint", async () => {
      const res = await platformRouter.request(
        `/v1/platform/admin/audit-logs?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the imports endpoints", async () => {
      const res = await platformRouter.request(
        `/v1/imports?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await platformRouter.request("/v1/platform-zzz");
      expect(res.status).toBe(404);
    });
  });
});
