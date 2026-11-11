import "../../../test/api-routes/env";

/**
 * CORS coverage for GET /v1/workspaces.
 *
 * The path is served by the legacy route handler
 * (app/api/v1/workspaces/route.ts), which shadows the identical Hono
 * registration because Next.js gives specific route.ts files precedence
 * over the [[...route]] catch-all — so the Hono CORS middleware never
 * sees these responses. The handler must thread the request Origin
 * through json()/errorResponse()/corsHeaders() itself (the allowlist
 * reflection from #232): the technician app's workspace leg was blocked
 * by the browser because every response from this endpoint — success,
 * error, and preflight — carried no Access-Control-Allow-Origin.
 *
 * @/server/api is the real module (only requireUser is stubbed), so the
 * assertions exercise the production corsHeaders allowlist.
 */
jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireUser: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
  createSupabaseAnonServerClient: jest.fn(),
  createSupabaseRequestClient: jest.fn(),
  createSupabaseServerClient: jest.fn(),
}));

import * as api from "@/server/api";
import { GET as workspacesGet, OPTIONS as workspacesOptions } from "../../../../app/api/v1/workspaces/route";
import {
  WS_ID,
  makeRequest,
  makeSupabaseClient,
  readJson,
  stubRequireUser,
  stubRequireUserReject,
} from "../../../test/api-routes/helpers";

const TECH_APP_ORIGIN = "https://techapp.servicewriter.xyz";
const TECH_APP_VERCEL_ORIGIN = "https://lovable-tech-partner.vercel.app";
const STRANGER_ORIGIN = "https://evil.example.com";

const MEMBERSHIP = {
  workspace_id: WS_ID,
  role: "owner",
  is_active: true,
  workspaces: {
    id: WS_ID,
    name: "Test Garage",
    slug: "test-garage",
    kind: "shop",
    timezone: "America/New_York",
    currency_code: "USD",
    is_active: true,
  },
};

const ORIGINAL_CORS_ENV = process.env.NEXT_PUBLIC_CORS_ORIGIN;

beforeEach(() => {
  jest.clearAllMocks();
  // Pin the default allowlist: no env-configured origins in play.
  delete process.env.NEXT_PUBLIC_CORS_ORIGIN;
});

afterAll(() => {
  if (ORIGINAL_CORS_ENV === undefined) {
    delete process.env.NEXT_PUBLIC_CORS_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_CORS_ORIGIN = ORIGINAL_CORS_ENV;
  }
});

function stubWorkspacesMember() {
  stubRequireUser(
    api,
    makeSupabaseClient({ workspace_members: { data: [MEMBERSHIP], error: null } }),
  );
}

describe("GET /v1/workspaces (legacy route handler) CORS", () => {
  it("reflects an allowlisted origin on the success response", async () => {
    stubWorkspacesMember();
    const res = await workspacesGet(
      makeRequest("/api/v1/workspaces", { headers: { Origin: TECH_APP_ORIGIN } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].workspace_id).toBe(WS_ID);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TECH_APP_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toBe("Origin");
    // The endpoint's own headers survive alongside the CORS headers.
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("reflects the tech app's Vercel origin on the success response", async () => {
    stubWorkspacesMember();
    const res = await workspacesGet(
      makeRequest("/api/v1/workspaces", { headers: { Origin: TECH_APP_VERCEL_ORIGIN } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TECH_APP_VERCEL_ORIGIN);
  });

  it("sends no Access-Control-Allow-Origin on the success response for a non-allowlisted origin", async () => {
    stubWorkspacesMember();
    const res = await workspacesGet(
      makeRequest("/api/v1/workspaces", { headers: { Origin: STRANGER_ORIGIN } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("reflects an allowlisted origin on the 401 error response", async () => {
    stubRequireUserReject(api);
    const res = await workspacesGet(
      makeRequest("/api/v1/workspaces", { headers: { Origin: TECH_APP_ORIGIN } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TECH_APP_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("sends no Access-Control-Allow-Origin on the 401 error response for a non-allowlisted origin", async () => {
    stubRequireUserReject(api);
    const res = await workspacesGet(
      makeRequest("/api/v1/workspaces", { headers: { Origin: STRANGER_ORIGIN } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("sends no CORS headers without an Origin header, exactly as before", async () => {
    stubWorkspacesMember();
    const res = await workspacesGet(makeRequest("/api/v1/workspaces"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("OPTIONS /v1/workspaces (legacy route handler) CORS", () => {
  it("answers preflight from an allowlisted origin with the reflected origin and credentials", async () => {
    const res = await workspacesOptions(
      makeRequest("/api/v1/workspaces", {
        method: "OPTIONS",
        headers: { Origin: TECH_APP_ORIGIN, "Access-Control-Request-Method": "GET" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TECH_APP_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("answers preflight from a non-allowlisted origin with no Access-Control-Allow-Origin", async () => {
    const res = await workspacesOptions(
      makeRequest("/api/v1/workspaces", {
        method: "OPTIONS",
        headers: { Origin: STRANGER_ORIGIN, "Access-Control-Request-Method": "GET" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers preflight without an Origin header exactly as before (no CORS headers)", async () => {
    const res = await workspacesOptions(makeRequest("/api/v1/workspaces", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
