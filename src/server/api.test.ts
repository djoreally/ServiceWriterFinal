jest.mock("@/lib/supabase", () => ({
  createSupabaseRequestClient: jest.fn(),
  createSupabaseServerClient: jest.fn(),
}));

// Must run before `@/server/api` pulls in `next/server`, which subclasses
// the Request/Response globals at import time.
import "@/test/web-globals";

import {
  ApiError,
  corsHeaders,
  errorResponse,
  json,
  paginationSchema,
  requireCrmCapability,
  requireUser,
  requireWorkspaceMember,
  requireWorkspacePaymentsAddon,
  workspaceIdSchema,
} from "@/server/api";
import { createSupabaseRequestClient, createSupabaseServerClient } from "@/lib/supabase";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const fakeUser = { id: USER_ID, email: "tech@example.com" };

function requestWith(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

function memberQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, jest.Mock> = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}

function apiSupabase(opts: {
  user?: unknown;
  userError?: unknown;
  tables?: Record<string, { data: unknown; error: unknown }>;
  rpcResult?: { data: unknown; error: unknown };
}) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: opts.userError ?? null }),
    },
    from: jest.fn((table: string) => memberQuery(opts.tables?.[table] ?? { data: null, error: null })),
    rpc: jest.fn().mockResolvedValue(opts.rpcResult ?? { data: null, error: null }),
  };
}

describe("workspaceIdSchema", () => {
  it("accepts valid UUIDs", () => {
    expect(workspaceIdSchema.safeParse(WORKSPACE_ID).success).toBe(true);
    expect(workspaceIdSchema.safeParse("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee").success).toBe(true);
  });

  it("rejects garbage, empty strings, and non-strings", () => {
    expect(workspaceIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(workspaceIdSchema.safeParse("").success).toBe(false);
    expect(workspaceIdSchema.safeParse(null).success).toBe(false);
    expect(workspaceIdSchema.safeParse(123).success).toBe(false);
  });
});

describe("paginationSchema", () => {
  it("applies defaults for limit and offset", () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 25, offset: 0 });
  });

  it("coerces numeric strings", () => {
    expect(paginationSchema.parse({ limit: "10", offset: "40" })).toEqual({ limit: 10, offset: 40 });
  });

  it("enforces bounds", () => {
    expect(paginationSchema.parse({ limit: 1, offset: 0 }).limit).toBe(1);
    expect(paginationSchema.parse({ limit: 100 }).limit).toBe(100);
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 1.5 })).toThrow();
    expect(() => paginationSchema.parse({ limit: "abc" })).toThrow();
  });
});

describe("ApiError", () => {
  it("carries status, message, and a default code", () => {
    const err = new ApiError(404, "nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe("nope");
    expect(err.code).toBe("api_error");
  });

  it("keeps an explicit code", () => {
    expect(new ApiError(422, "bad", "orphan_customer").code).toBe("orphan_customer");
  });
});

describe("corsHeaders", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CORS_ORIGIN;
  });

  it("sets the full CORS header set when an origin is configured", () => {
    process.env.NEXT_PUBLIC_CORS_ORIGIN = "https://app.example.com";
    const headers = corsHeaders();
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("authorization, content-type");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,PATCH,PUT,DELETE,OPTIONS");
    expect(headers.get("Vary")).toBe("Origin");
  });

  it("returns empty headers when no origin is configured", () => {
    const headers = corsHeaders();
    expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect([...headers.keys()]).toHaveLength(0);
  });
});

describe("json", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CORS_ORIGIN;
  });

  it("serializes the payload with status and custom headers", async () => {
    const res = json({ ok: true }, { status: 201, headers: { "x-custom": "yes" } });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(res.headers.get("x-custom")).toBe("yes");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("includes CORS headers when an origin is configured", () => {
    process.env.NEXT_PUBLIC_CORS_ORIGIN = "https://app.example.com";
    const res = json({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });
});

describe("errorResponse", () => {
  it("maps ApiError to its status, code, and message", async () => {
    const res = errorResponse(new ApiError(422, "orphan row", "orphan_customer"));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: { code: "orphan_customer", message: "orphan row" } });
  });

  it("maps known postgres error codes", async () => {
    const cases: Array<[string, number, string]> = [
      ["PGRST116", 404, "not_found"],
      ["23505", 409, "conflict"],
      ["23503", 409, "invalid_reference"],
      ["22P02", 400, "invalid_input"],
      ["22007", 400, "invalid_input"],
      ["22023", 400, "invalid_input"],
    ];
    for (const [code, status, mapped] of cases) {
      const res = errorResponse({ code, message: "db says no" });
      expect(res.status).toBe(status);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(mapped);
    }
  });

  it("passes through 4xx/5xx status carriers with their code and message", async () => {
    const res = errorResponse({ status: 429, code: "rate_limited", message: "slow down" });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: { code: "rate_limited", message: "slow down" } });
  });

  it("falls back to 500 for unexpected errors and logs a diagnostic", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = errorResponse(new Error("boom"));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: { code: "internal_error", message: "An unexpected error occurred." },
      });
      expect(consoleSpy).toHaveBeenCalledWith("[api] unexpected error", expect.objectContaining({ message: "boom" }));
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("returns 500 for non-error garbage without leaking it", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = errorResponse("totally not an error object");
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toBe("An unexpected error occurred.");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("requireUser", () => {
  it("uses the bearer token client when an authorization header is present", async () => {
    const supabase = apiSupabase({ user: fakeUser });
    (createSupabaseRequestClient as jest.Mock).mockReturnValue(supabase);
    const result = await requireUser(requestWith({ authorization: "Bearer token-123" }));
    expect(createSupabaseRequestClient).toHaveBeenCalledWith("token-123");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(result).toMatchObject({ supabase, user: fakeUser });
  });

  it("falls back to the server client without a bearer token", async () => {
    const supabase = apiSupabase({ user: fakeUser });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    const result = await requireUser(requestWith());
    expect(createSupabaseServerClient).toHaveBeenCalled();
    expect(createSupabaseRequestClient).not.toHaveBeenCalled();
    expect(result.user).toEqual(fakeUser);
  });

  it("throws 401 when getUser fails on the bearer path", async () => {
    (createSupabaseRequestClient as jest.Mock).mockReturnValue(apiSupabase({ userError: { message: "bad token" } }));
    await expect(requireUser(requestWith({ authorization: "Bearer nope" }))).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("throws 401 when no user is returned on the server path", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(apiSupabase({ user: null }));
    await expect(requireUser()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });
});

describe("requireWorkspaceMember", () => {
  it("rejects an invalid workspace id before touching supabase", async () => {
    await expect(requireWorkspaceMember("nope")).rejects.toMatchObject({ status: 400, code: "invalid_workspace" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(createSupabaseRequestClient).not.toHaveBeenCalled();
  });

  it("returns the membership when the role is allowed", async () => {
    const membership = { workspace_id: WORKSPACE_ID, user_id: USER_ID, role: "owner", is_active: true };
    const supabase = apiSupabase({ user: fakeUser, tables: { workspace_members: { data: membership, error: null } } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);

    const result = await requireWorkspaceMember(WORKSPACE_ID, ["owner", "admin"]);
    expect(result.membership).toEqual(membership);
    expect(result.user).toEqual(fakeUser);
    expect(supabase.from).toHaveBeenCalledWith("workspace_members");
  });

  it("throws 403 when there is no membership", async () => {
    const supabase = apiSupabase({ user: fakeUser, tables: { workspace_members: { data: null, error: null } } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireWorkspaceMember(WORKSPACE_ID)).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("throws 403 when the role is not in the allowed list", async () => {
    const supabase = apiSupabase({
      user: fakeUser,
      tables: { workspace_members: { data: { role: "viewer" }, error: null } },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireWorkspaceMember(WORKSPACE_ID, ["owner", "admin"])).rejects.toMatchObject({
      status: 403,
      message: "Insufficient workspace permissions",
    });
  });

  it("propagates membership query errors", async () => {
    const queryError = { message: "db down", code: "500" };
    const supabase = apiSupabase({ user: fakeUser, tables: { workspace_members: { data: null, error: queryError } } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireWorkspaceMember(WORKSPACE_ID)).rejects.toBe(queryError);
  });
});

describe("requireWorkspacePaymentsAddon", () => {
  function authedBilling(billing: unknown) {
    const membership = { workspace_id: WORKSPACE_ID, user_id: USER_ID, role: "owner", is_active: true };
    const supabase = apiSupabase({
      user: fakeUser,
      tables: {
        workspace_members: { data: membership, error: null },
        workspace_billing: { data: billing, error: null },
      },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    return supabase;
  }

  it("returns billing when the add-on is active on an active subscription", async () => {
    const billing = { payments_addon_active: true, subscription_status: "active" };
    authedBilling(billing);
    const result = await requireWorkspacePaymentsAddon(WORKSPACE_ID);
    expect(result.billing).toEqual(billing);
  });

  it("accepts a trialing subscription", async () => {
    authedBilling({ payments_addon_active: true, subscription_status: "trialing" });
    const result = await requireWorkspacePaymentsAddon(WORKSPACE_ID);
    expect(result.billing.subscription_status).toBe("trialing");
  });

  it("throws 402 when the add-on is inactive", async () => {
    authedBilling({ payments_addon_active: false, subscription_status: "active" });
    await expect(requireWorkspacePaymentsAddon(WORKSPACE_ID)).rejects.toMatchObject({
      status: 402,
      code: "payments_addon_required",
    });
  });

  it("throws 402 when the subscription is not active", async () => {
    authedBilling({ payments_addon_active: true, subscription_status: "canceled" });
    await expect(requireWorkspacePaymentsAddon(WORKSPACE_ID)).rejects.toMatchObject({ status: 402 });
  });

  it("throws 402 when there is no billing row", async () => {
    authedBilling(null);
    await expect(requireWorkspacePaymentsAddon(WORKSPACE_ID)).rejects.toMatchObject({ status: 402 });
  });

  it("propagates billing query errors", async () => {
    const membership = { workspace_id: WORKSPACE_ID, user_id: USER_ID, role: "owner", is_active: true };
    const billingError = { message: "db down" };
    const supabase = apiSupabase({
      user: fakeUser,
      tables: {
        workspace_members: { data: membership, error: null },
        workspace_billing: { data: null, error: billingError },
      },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireWorkspacePaymentsAddon(WORKSPACE_ID)).rejects.toBe(billingError);
  });
});

describe("requireCrmCapability", () => {
  it("rejects an invalid workspace id before authenticating", async () => {
    await expect(requireCrmCapability(requestWith(), "nope", "crm.read")).rejects.toMatchObject({
      status: 400,
      code: "invalid_workspace",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("authorizes when the capability rpc returns true", async () => {
    const supabase = apiSupabase({ user: fakeUser, rpcResult: { data: true, error: null } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    const result = await requireCrmCapability(requestWith(), WORKSPACE_ID, "crm.read");
    expect(supabase.rpc).toHaveBeenCalledWith("has_crm_capability", {
      target_workspace_id: WORKSPACE_ID,
      required_capability: "crm.read",
    });
    expect(result.user).toEqual(fakeUser);
  });

  it("throws 403 crm_forbidden when the capability rpc returns false", async () => {
    const supabase = apiSupabase({ user: fakeUser, rpcResult: { data: false, error: null } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireCrmCapability(requestWith(), WORKSPACE_ID, "crm.read")).rejects.toMatchObject({
      status: 403,
      code: "crm_forbidden",
    });
  });

  it("propagates rpc errors", async () => {
    const rpcError = { message: "rpc failed" };
    const supabase = apiSupabase({ user: fakeUser, rpcResult: { data: null, error: rpcError } });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
    await expect(requireCrmCapability(requestWith(), WORKSPACE_ID, "crm.read")).rejects.toBe(rpcError);
  });
});
