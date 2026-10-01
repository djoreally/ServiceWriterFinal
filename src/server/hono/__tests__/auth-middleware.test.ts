/**
 * Grey-box tests for the Hono auth middleware wrappers
 * (`src/server/hono/middleware/auth.ts`) against the REAL `@/server/api`
 * auth functions, with only the Supabase client factories mocked.
 *
 * This exercises the actual credential flow: bearer-token extraction,
 * workspace_id UUID validation, membership/role checks, the payments
 * add-on gate, and the ApiError code/status contract.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
} from "../test-support/moduleMocks";
import { Hono } from "hono";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);

import {
  requireAuth,
  requireWorkspaceAuth,
  requireWorkspacePaymentsAddonAuth,
} from "@/server/hono/middleware/auth";
import { testRouter } from "../test-support/routerTest";
import {
  db,
  mockSupabase,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const originalGetUser = (mockSupabase.auth as Record<string, unknown>)
  .getUser as () => Promise<unknown>;

function failGetUser() {
  (mockSupabase.auth as Record<string, unknown>).getUser = async () => ({
    data: { user: null },
    error: null,
  });
}

beforeEach(() => {
  resetHarness();
  (mockSupabase.auth as Record<string, unknown>).getUser = originalGetUser;
});

function memberRow(role = "owner") {
  db["workspace_members:single"] = {
    data: { workspace_id: WS_ID, user_id: USER_ID, role, is_active: true },
    error: null,
  };
}

/** Tiny probe app so the wrappers run with a real Hono Context. */
function probeApp() {
  const app = new Hono();
  app.get("/probe-auth", async (c) => {
    const { user } = await requireAuth(c as never);
    return Response.json({ user: { id: (user as { id: string }).id } });
  });
  app.get("/probe-workspace", async (c) => {
    const { membership } = await requireWorkspaceAuth(c as never, WS_ID);
    return Response.json({ role: membership.role });
  });
  app.get("/probe-workspace-roles", async (c) => {
    const { membership } = await requireWorkspaceAuth(c as never, WS_ID, [
      "owner",
      "admin",
    ]);
    return Response.json({ role: membership.role });
  });
  app.get("/probe-bad-workspace", async (c) => {
    await requireWorkspaceAuth(c as never, "not-a-uuid");
    return Response.json({ ok: true });
  });
  app.get("/probe-addon", async (c) => {
    const { billing } = await requireWorkspacePaymentsAddonAuth(
      c as never,
      WS_ID,
    );
    return Response.json({ billing });
  });
  return testRouter(app);
}

describe("hono auth middleware", () => {
  describe("requireAuth", () => {
    it("authenticates a bearer token", async () => {
      const app = probeApp();
      const res = await app.request("/probe-auth", {
        headers: { authorization: "Bearer test-token" },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).user.id).toBe(USER_ID);
    });

    it("authenticates without a bearer token (cookie/session path)", async () => {
      const app = probeApp();
      const res = await app.request("/probe-auth");
      expect(res.status).toBe(200);
      expect((await res.json()).user.id).toBe(USER_ID);
    });

    it("throws 401 unauthenticated when no user resolves", async () => {
      failGetUser();
      const app = probeApp();
      const res = await app.request("/probe-auth", {
        headers: { authorization: "Bearer bad-token" },
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthenticated");
    });
  });

  describe("requireWorkspaceAuth", () => {
    it("authorizes an active member", async () => {
      memberRow("manager");
      const app = probeApp();
      const res = await app.request("/probe-workspace");
      expect(res.status).toBe(200);
      expect((await res.json()).role).toBe("manager");
    });

    it("rejects a malformed workspace_id with 400", async () => {
      const app = probeApp();
      const res = await app.request("/probe-bad-workspace");
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_workspace");
    });

    it("rejects non-members with 403", async () => {
      db["workspace_members:single"] = { data: null, error: null };
      const app = probeApp();
      const res = await app.request("/probe-workspace");
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    });

    it("enforces the role allow-list", async () => {
      memberRow("technician");
      const app = probeApp();
      const res = await app.request("/probe-workspace-roles");
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    });
  });

  describe("requireWorkspacePaymentsAddonAuth", () => {
    it("passes when the add-on is active", async () => {
      memberRow("owner");
      db["workspace_billing:single"] = {
        data: { payments_addon_active: true, subscription_status: "active" },
        error: null,
      };
      const app = probeApp();
      const res = await app.request("/probe-addon");
      expect(res.status).toBe(200);
      expect((await res.json()).billing.payments_addon_active).toBe(true);
    });

    it("throws 402 when the add-on is inactive", async () => {
      memberRow("owner");
      db["workspace_billing:single"] = {
        data: { payments_addon_active: false, subscription_status: "active" },
        error: null,
      };
      const app = probeApp();
      const res = await app.request("/probe-addon");
      expect(res.status).toBe(402);
      expect((await res.json()).error.code).toBe("payments_addon_required");
    });
  });
});
